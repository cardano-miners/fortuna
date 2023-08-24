import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import {
  applyParamsToScript,
  Constr,
  Data,
  fromHex,
  fromText,
  generateSeedPhrase,
  Lucid,
  Script,
  sha256,
  toHex,
} from "https://deno.land/x/lucid@0.10.1/mod.ts";
import {
  calculateInterlink,
  getDifficulty,
  incrementU8Array,
  readValidator,
} from "./utils.ts";

// Excludes datum field because it is not needed
// and it's annoying to type.
type Genesis = {
  validator: Script;
  validatorHash: string;
  validatorAddress: string;
  boostrapHash: string;
  outRef: { txHash: string; index: number };
};

const mine = new Command()
  .description("Start the miner")
  .option("-p, --preprod", "Use testnet")
  .action(async ({ preprod }) => {
    const genesisFile = Deno.readTextFileSync(
      `genesis/${preprod ? "preprod" : "mainnet"}.json`,
    );

    const {
      validator,
      validatorHash,
      validatorAddress,
    }: Genesis = JSON.parse(genesisFile);

    const lucid = await Lucid.new(undefined, preprod ? "Preprod" : "Mainnet");

    lucid.selectWalletFromSeed(Deno.readTextFileSync("seed.txt"));

    const validatorUTXOs = await lucid.utxosAt(validatorAddress);

    const validatorOutRef = validatorUTXOs.find((u) =>
      u.assets[validatorHash + fromText("lord tuna")]
    )!;

    const validatorState = validatorOutRef.datum!;

    const state = Data.from(validatorState) as Constr<
      string | bigint | string[]
    >;

    state.fields;

    state;

    const nonce = new Uint8Array(16);

    const targetState = new Constr(0, [
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

    while (true) {
      targetHash = sha256(sha256(fromHex(Data.to(targetState))));

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

    const realTimeNow = Date.now();

    const interlink = calculateInterlink(toHex(targetHash), difficulty, {
      leadingZeros: state.fields[2] as bigint,
      difficulty_number: state.fields[3] as bigint,
    });

    const postDatum = new Constr(0, [
      state.fields[0] as bigint + 1n,
      toHex(targetHash),
      state.fields[2] as bigint,
      state.fields[3] as bigint,
      BigInt(45000 + realTimeNow) - (state.fields[5] as bigint),
      BigInt(45000 + realTimeNow),
      0n,
      interlink,
    ]);

    const outDat = Data.to(postDatum);

    console.log(`Found next datum: ${outDat}`);

    const mintTokens = { [validatorHash + fromText("TUNA")]: 5000000000n };
    const masterToken = { [validatorHash + fromText("lord tuna")]: 1n };

    const txMine = await lucid
      .newTx()
      .collectFrom([validatorOutRef], Data.to(new Constr(1, [toHex(nonce)])))
      .payToAddressWithData(validatorAddress, { inline: outDat }, masterToken)
      .mintAssets(mintTokens, Data.to(new Constr(0, [])))
      .attachMintingPolicy(validator)
      .validTo(realTimeNow + 90000)
      .validFrom(realTimeNow)
      .complete();

    const signed = await txMine.sign().complete();

    await signed.submit();

    console.log(`TX HASH: ${signed.toHash()}`);
    console.log("Waiting for confirmation...");

    await lucid.awaitTx(signed.toHash());
  });

const genesis = new Command()
  .description("Create block 0 using an ideally random out ref")
  .arguments("<tx-hash:string> <index:number>")
  .option("-p, --preprod", "Use testnet")
  .action(async ({ preprod }, txHash, index) => {
    const unAppliedValidator = readValidator();

    const lucid = await Lucid.new(undefined, preprod ? "Preprod" : "Mainnet");

    lucid.selectWalletFromSeed(Deno.readTextFileSync("seed.txt"));

    const initOutputRef = new Constr(0, [new Constr(0, [txHash]), index]);

    const appliedValidator = applyParamsToScript(unAppliedValidator.script, [
      initOutputRef,
    ]);

    const validator: Script = {
      type: "PlutusV2",
      script: appliedValidator,
    };

    const boostrapHash = toHex(sha256(sha256(fromHex(Data.to(initOutputRef)))));

    const timeNow = Date.now();

    // State
    const preDatum = new Constr(0, [
      // block_number: Int
      0n,
      // current_hash: ByteArray
      boostrapHash,
      // leading_zeros: Int
      4n,
      // difficulty_number: Int
      65535n,
      // epoch_time: Int
      0n,
      // current_posix_time: Int
      BigInt(45000 + timeNow),
      // extra: Data
      0n,
      // interlink: List<Data>
      [],
    ]);

    const datum = Data.to(preDatum);

    const validatorAddress = lucid.utils.validatorToAddress(validator);

    const validatorHash = lucid.utils.validatorToScriptHash(validator);

    const masterToken = { [validatorHash + fromText("lord tuna")]: 1n };

    const tx = await lucid
      .newTx()
      .collectFrom([])
      .payToContract(validatorAddress, { inline: datum }, masterToken)
      .mintAssets(masterToken, Data.to(new Constr(1, [])))
      .attachMintingPolicy(validator)
      .validFrom(timeNow)
      .validTo(timeNow + 90000)
      .complete();

    const signed = await tx.sign().complete();

    await signed.submit();

    await lucid.awaitTx(signed.toHash());

    Deno.writeTextFileSync(
      `genesis/${preprod ? "preprod" : "mainnet"}.json`,
      JSON.stringify({
        validator: validator.script,
        validatorHash,
        validatorAddress,
        boostrapHash,
        datum: JSON.parse(Data.toJson(preDatum)),
        outRef: { txHash, index },
      }),
    );
  });

const init = new Command()
  .description("Initialize the miner")
  .action(() => {
    const seed = generateSeedPhrase();

    Deno.writeTextFileSync("seed.txt", seed);

    console.log(`Miner wallet initialized and saved to seed.txt`);
  });

const address = new Command()
  .description("Check address balance")
  .option("-p, --preprod", "Use testnet")
  .action(async ({ preprod }) => {
    const lucid = await Lucid.new(undefined, preprod ? "Preprod" : "Mainnet");

    lucid.selectWalletFromSeed(Deno.readTextFileSync("seed.txt"));

    const address = await lucid.wallet.address();

    console.log(`Address: ${address}`);
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
