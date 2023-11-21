import { loadSync } from "https://deno.land/std@0.199.0/dotenv/mod.ts";
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import {
  applyParamsToScript,
  Constr,
  Data,
  fromHex,
  fromText,
  generateSeedPhrase,
  Kupmios,
  Lucid,
  Script,
  sha256,
  toHex,
} from "lucid-cardano";
import {
  calculateDifficultyNumber,
  calculateInterlink,
  getDifficulty,
  getDifficultyAdjustement,
  incrementU8Array,
  readValidator,
} from "./utils";

loadSync({ export: true, allowEmptyValues: true });

// Excludes datum field because it is not needed
// and it's annoying to type.
type Genesis = {
  validator: string;
  validatorHash: string;
  validatorAddress: string;
  bootstrapHash: string;
  outRef: { txHash: string; index: number };
};

const delay = (ms: number | undefined) =>
  new Promise((res) => setTimeout(res, ms));

const mine = new Command()
  .description("Start the miner")
  .env("KUPO_URL=<value:string>", "Kupo URL", { required: true })
  .env("OGMIOS_URL=<value:string>", "Ogmios URL", { required: true })
  .option("-p, --preview", "Use testnet")
  .action(async ({ preview, ogmiosUrl, kupoUrl }) => {
    while (true) {
      const genesisFile = Deno.readTextFileSync(
        `genesis/${preview ? "preview" : "mainnet"}.json`
      );

      const { validatorHash, validatorAddress }: Genesis =
        JSON.parse(genesisFile);

      const provider = new Kupmios(kupoUrl, ogmiosUrl);
      const lucid = await Lucid.new(provider, preview ? "Preview" : "Mainnet");

      lucid.selectWalletFromSeed(Deno.readTextFileSync("seed.txt"));

      let validatorUTXOs = await lucid.utxosAt(validatorAddress);

      let validatorOutRef = validatorUTXOs.find(
        (u) => u.assets[validatorHash + fromText("lord tuna")]
      )!;

      let validatorState = validatorOutRef.datum!;

      let state = Data.from(validatorState) as Constr<
        string | bigint | string[]
      >;

      let nonce = new Uint8Array(16);

      crypto.getRandomValues(nonce);

      let targetState = new Constr(0, [
        // nonce: ByteArray
        toHex(nonce),
        // block_number: Int
        state.fields[0] as bigint,
        // current_hash: ByteArray
        state.fields[1] as bigint,
        // leading_zeros: Int
        state.fields[2] as bigint,
        // difficulty_number: Int
        state.fields[3] as bigint,
        //epoch_time: Int
        state.fields[4] as bigint,
      ]);

      let targetHash: Uint8Array;

      let difficulty: {
        leadingZeros: bigint;
        difficulty_number: bigint;
      };

      console.log("Mining...");
      let timer = new Date().valueOf();
      let hashCounter = 0;
      let startTime = Date.now();
      while (true) {
        if (new Date().valueOf() - timer > 5000) {
          console.log("New block not found in 5 seconds, updating state");
          timer = new Date().valueOf();
          validatorUTXOs = await lucid.utxosAt(validatorAddress);

          validatorOutRef = validatorUTXOs.find(
            (u) => u.assets[validatorHash + fromText("lord tuna")]
          )!;

          if (validatorState !== validatorOutRef.datum!) {
            validatorState = validatorOutRef.datum!;

            state = Data.from(validatorState) as Constr<
              string | bigint | string[]
            >;

            nonce = new Uint8Array(16);

            crypto.getRandomValues(nonce);

            targetState = new Constr(0, [
              // nonce: ByteArray
              toHex(nonce),
              // block_number: Int
              state.fields[0] as bigint,
              // current_hash: ByteArray
              state.fields[1] as bigint,
              // leading_zeros: Int
              state.fields[2] as bigint,
              // difficulty_number: Int
              state.fields[3] as bigint,
              //epoch_time: Int
              state.fields[4] as bigint,
            ]);
          }
        }

        targetHash = sha256(sha256(fromHex(Data.to(targetState))));
        hashCounter++;

        if (Date.now() - startTime > 30000) {
          // Every 30,000 milliseconds (or 30 seconds)
          let rate = hashCounter / ((Date.now() - startTime) / 1000); // Calculate rate
          console.log(
            `Average Hashrate over the last 30 seconds: ${rate.toFixed(2)} H/s`
          );

          // Reset the counter and the timer
          hashCounter = 0;
          startTime = Date.now();
        }

        difficulty = getDifficulty(targetHash);

        const { leadingZeros, difficulty_number } = difficulty;

        if (
          leadingZeros > (state.fields[2] as bigint) ||
          (leadingZeros == (state.fields[2] as bigint) &&
            difficulty_number < (state.fields[3] as bigint))
        ) {
          break;
        }

        incrementU8Array(nonce);

        targetState.fields[0] = toHex(nonce);
      }

      const realTimeNow = Number((Date.now() / 1000).toFixed(0)) * 1000 - 60000;

      const interlink = calculateInterlink(
        toHex(targetHash),
        difficulty,
        {
          leadingZeros: state.fields[2] as bigint,
          difficulty_number: state.fields[3] as bigint,
        },
        state.fields[7] as string[]
      );

      let epoch_time =
        (state.fields[4] as bigint) +
        BigInt(90000 + realTimeNow) -
        (state.fields[5] as bigint);

      let difficulty_number = state.fields[3] as bigint;
      let leading_zeros = state.fields[2] as bigint;

      if (
        (state.fields[0] as bigint) % 2016n === 0n &&
        (state.fields[0] as bigint) > 0
      ) {
        const adjustment = getDifficultyAdjustement(epoch_time, 1_209_600_000n);

        epoch_time = 0n;

        const new_difficulty = calculateDifficultyNumber(
          {
            leadingZeros: state.fields[2] as bigint,
            difficulty_number: state.fields[3] as bigint,
          },
          adjustment.numerator,
          adjustment.denominator
        );

        difficulty_number = new_difficulty.difficulty_number;
        leading_zeros = new_difficulty.leadingZeros;
      }

      // calculateDifficultyNumber();

      const postDatum = new Constr(0, [
        (state.fields[0] as bigint) + 1n,
        toHex(targetHash),
        leading_zeros,
        difficulty_number,
        epoch_time,
        BigInt(90000 + realTimeNow),
        fromText("AlL HaIl tUnA"),
        interlink,
      ]);

      const outDat = Data.to(postDatum);

      console.log(`Found next datum: ${outDat}`);

      const mintTokens = { [validatorHash + fromText("TUNA")]: 5000000000n };
      const masterToken = { [validatorHash + fromText("lord tuna")]: 1n };
      try {
        const readUtxo = await lucid.utxosByOutRef([
          {
            txHash:
              "01751095ea408a3ebe6083b4de4de8a24b635085183ab8a2ac76273ef8fff5dd",
            outputIndex: 0,
          },
        ]);
        const txMine = await lucid
          .newTx()
          .collectFrom(
            [validatorOutRef],
            Data.to(new Constr(1, [toHex(nonce)]))
          )
          .payToAddressWithData(
            validatorAddress,
            { inline: outDat },
            masterToken
          )
          .mintAssets(mintTokens, Data.to(new Constr(0, [])))
          .readFrom(readUtxo)
          .validTo(realTimeNow + 180000)
          .validFrom(realTimeNow)
          .complete();

        const signed = await txMine.sign().complete();

        await signed.submit();

        console.log(`TX HASH: ${signed.toHash()}`);
        console.log("Waiting for confirmation...");

        // // await lucid.awaitTx(signed.toHash());
        await delay(5000);
      } catch (e) {
        console.log(e);
      }
    }
  });

const genesis = new Command()
  .description("Create block 0")
  .env("KUPO_URL=<value:string>", "Kupo URL", { required: true })
  .env("OGMIOS_URL=<value:string>", "Ogmios URL", { required: true })
  .option("-p, --preview", "Use testnet")
  .action(async ({ preview, ogmiosUrl, kupoUrl }) => {
    const unAppliedValidator = readValidator();

    const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? "Preview" : "Mainnet");
    lucid.selectWalletFromSeed(Deno.readTextFileSync("seed.txt"));

    const utxos = await lucid.wallet.getUtxos();

    if (utxos.length === 0) {
      throw new Error("No UTXOs Found");
    }

    const initOutputRef = new Constr(0, [
      new Constr(0, [utxos[0].txHash]),
      BigInt(utxos[0].outputIndex),
    ]);

    const appliedValidator = applyParamsToScript(unAppliedValidator.script, [
      initOutputRef,
    ]);

    const validator: Script = {
      type: "PlutusV2",
      script: appliedValidator,
    };

    const bootstrapHash = toHex(
      sha256(sha256(fromHex(Data.to(initOutputRef))))
    );

    const validatorAddress = lucid.utils.validatorToAddress(validator);

    const validatorHash = lucid.utils.validatorToScriptHash(validator);

    const masterToken = { [validatorHash + fromText("lord tuna")]: 1n };

    const timeNow = Number((Date.now() / 1000).toFixed(0)) * 1000 - 60000;

    // State
    const preDatum = new Constr(0, [
      // block_number: Int
      0n,
      // current_hash: ByteArray
      bootstrapHash,
      // leading_zeros: Int
      5n,
      // difficulty_number: Int
      65535n,
      // epoch_time: Int
      0n,
      // current_posix_time: Int
      BigInt(90000 + timeNow),
      // extra: Data
      0n,
      // interlink: List<Data>
      [],
    ]);

    const datum = Data.to(preDatum);

    const tx = await lucid
      .newTx()
      .collectFrom(utxos)
      .payToContract(validatorAddress, { inline: datum }, masterToken)
      .mintAssets(masterToken, Data.to(new Constr(1, [])))
      .attachMintingPolicy(validator)
      .validFrom(timeNow)
      .validTo(timeNow + 180000)
      .complete();

    const signed = await tx.sign().complete();

    try {
      await signed.submit();

      console.log(`TX Hash: ${signed.toHash()}`);

      await lucid.awaitTx(signed.toHash());

      console.log(`Completed and saving genesis file.`);

      Deno.writeTextFileSync(
        `genesis/${preview ? "preview" : "mainnet"}.json`,
        JSON.stringify({
          validator: validator.script,
          validatorHash,
          validatorAddress,
          bootstrapHash,
          datum,
          outRef: { txHash: utxos[0].txHash, index: utxos[0].outputIndex },
        })
      );
    } catch (e) {
      console.log(e);
    }
  });

const init = new Command().description("Initialize the miner").action(() => {
  const seed = generateSeedPhrase();

  Deno.writeTextFileSync("seed.txt", seed);

  console.log(`Miner wallet initialized and saved to seed.txt`);
});

const address = new Command()
  .description("Check address balance")
  .env("KUPO_URL=<value:string>", "Kupo URL", { required: true })
  .env("OGMIOS_URL=<value:string>", "Ogmios URL", { required: true })
  .option("-p, --preview", "Use testnet")
  .action(async ({ preview, ogmiosUrl, kupoUrl }) => {
    const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? "Preview" : "Mainnet");

    lucid.selectWalletFromSeed(Deno.readTextFileSync("seed.txt"));

    const address = await lucid.wallet.address();

    const utxos = await lucid.wallet.getUtxos();

    const balance = utxos.reduce((acc, u) => {
      return acc + u.assets.lovelace;
    }, 0n);

    console.log(`Address: ${address}`);
    console.log(`ADA Balance: ${balance / 1_000_000n}`);

    try {
      const genesisFile = Deno.readTextFileSync(
        `genesis/${preview ? "preview" : "mainnet"}.json`
      );

      const { validatorHash }: Genesis = JSON.parse(genesisFile);

      const tunaBalance = utxos.reduce((acc, u) => {
        return acc + (u.assets[validatorHash + fromText("TUNA")] ?? 0n);
      }, 0n);

      console.log(`TUNA Balance: ${tunaBalance / 100_000_000n}`);
    } catch {
      console.log(`TUNA Balance: 0`);
    }
  });

await new Command()
  .name("fortuna")
  .description("Fortuna miner")
  .version("0.0.1")
  .command("mine", mine)
  .command("genesis", genesis)
  .command("init", init)
  .command("address", address)
  .parse(Deno.args);
