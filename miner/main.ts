import 'dotenv/config';
import { Command, Option } from '@commander-js/extra-typings';
import {
  applyParamsToScript,
  Constr,
  Data,
  fromHex,
  fromText,
  generateSeedPhrase,
  KupmiosV5 as Kupmios,
  Translucent,
  type Script,
  toHex,
  UTxO,
} from 'translucent-cardano/index';
import fs from 'fs';
import crypto from 'crypto';
import { WebSocket } from 'ws';

import { plus100 } from './sha-gpu';

import {
  blake256,
  calculateDifficultyNumber,
  calculateInterlink,
  getDifficulty,
  getDifficultyAdjustement,
  incrementNonce,
  readValidator,
  readValidators,
  sha256,
} from './utils';

Object.assign(global, { WebSocket });

// Excludes datum field because it is not needed
// and it's annoying to type.
type Genesis = {
  validator: string;
  validatorHash: string;
  validatorAddress: string;
  bootstrapHash: string;
  outRef: { txHash: string; index: number };
};

type GenesisV2 = {
  forkValidator: {
    validator: string;
    validatorHash: string;
    validatorAddress: string;
    outRef: { txHash: string; index: number };
  };
  tunaV2MintValidator: {
    validator: string;
    validatorHash: string;
    validatorAddress: string;
  };
  tunaV2SpendValidator: {
    validator: string;
    validatorHash: string;
    validatorAddress: string;
  };
};

const delay = (ms: number | undefined) => new Promise((res) => setTimeout(res, ms));

const app = new Command();

app.name('fortuna').description('Fortuna miner').version('0.0.1');

const kupoUrlOption = new Option('-k, --kupo-url <string>', 'Kupo URL')
  .env('KUPO_URL')
  .makeOptionMandatory(true);

const ogmiosUrlOption = new Option('-o, --ogmios-url <string>', 'Ogmios URL')
  .env('OGMIOS_URL')
  .makeOptionMandatory(true);

const previewOption = new Option('-p, --preview', 'Use testnet').default(false);

app
  .command('mine')
  .description('Start the miner')
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, kupoUrl, ogmiosUrl }) => {
    const alwaysLoop = true;

    const {
      validatorHash: tunav1ValidatorHash,
      validatorAddress: tunav1ValidatorAddress,
    }: Genesis = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'preview' : 'mainnet'}.json`, {
        encoding: 'utf8',
      }),
    );

    const {
      tunaV2MintValidator: { validatorHash: tunav2ValidatorHash },
      tunaV2SpendValidator: {
        validatorHash: tunav2SpendValidatorHash,
        validatorAddress: tunaV2ValidatorAddress,
      },
    }: GenesisV2 = JSON.parse(
      fs.readFileSync(`genesisV2/${preview ? 'preview' : 'mainnet'}.json`, {
        encoding: 'utf8',
      }),
    );

    const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Translucent.new(provider, preview ? 'Preview' : 'Mainnet');
    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf8' }));

    const userPkh = lucid.utils.getAddressDetails(await lucid.wallet.address()).paymentCredential!;

    const minerCredential = new Constr(0, [userPkh.hash, 'AlL HaIl tUnA']);

    const minerCredHash = await blake256(fromHex(Data.to(minerCredential)));

    while (alwaysLoop) {
      let minerOutput = (
        await lucid.utxosAtWithUnit(
          tunaV2ValidatorAddress,
          tunav2ValidatorHash + fromText('TUNA') + tunav2SpendValidatorHash,
        )
      )[0];

      let state = Data.from(minerOutput.datum!) as Constr<string | bigint>;

      let nonce = new Uint8Array(16);

      crypto.getRandomValues(nonce);

      let targetState = fromHex(
        Data.to(
          new Constr(0, [
            // nonce: ByteArray
            toHex(nonce),
            // miner_cred_hash: ByteArray
            toHex(minerCredHash),
            // block_number: Int
            state.fields[0] as bigint,
            // current_hash: ByteArray
            state.fields[1] as string,
            // leading_zeros: Int
            state.fields[2] as bigint,
            // difficulty_number: Int
            state.fields[3] as bigint,
            // epoch_time: Int
            state.fields[4] as bigint,
          ]),
        ),
      );

      let targetHash = await sha256(await sha256(targetState));

      let difficulty = {
        leadingZeros: 50n,
        difficultyNumber: 50n,
      };

      console.log('Mining...');
      let timer = Date.now();
      let hashCounter = 0;
      let startTime = timer;

      const alwaysLoop2 = true;

      while (alwaysLoop2) {
        if (Date.now() - timer > 10000) {
          console.log('New block not found in 10 seconds, updating state');
          timer = new Date().valueOf();

          minerOutput = (
            await lucid.utxosAtWithUnit(
              tunaV2ValidatorAddress,
              tunav2ValidatorHash + fromText('TUNA') + tunav2SpendValidatorHash,
            )
          )[0];

          if (state !== Data.from(minerOutput.datum!)) {
            state = Data.from(minerOutput.datum!) as Constr<string | bigint>;

            nonce = new Uint8Array(16);

            crypto.getRandomValues(nonce);

            targetState = fromHex(
              Data.to(
                new Constr(0, [
                  // nonce: ByteArray
                  toHex(nonce),
                  // miner_cred_hash: ByteArray
                  toHex(minerCredHash),
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
                ]),
              ),
            );
          }

          targetHash = await sha256(await sha256(targetState));
        }

        hashCounter++;

        if (Date.now() - startTime > 30000) {
          // Every 30,000 milliseconds (or 30 seconds)
          const rate = hashCounter / ((Date.now() - startTime) / 1000); // Calculate rate
          console.log(`Average Hashrate over the last 30 seconds: ${rate.toFixed(2)} H/s`);

          // Reset the counter and the timer
          hashCounter = 0;
          startTime = Date.now();
        }

        difficulty = getDifficulty(targetHash);

        const { leadingZeros, difficultyNumber: difficultyNumber } = difficulty;

        if (
          leadingZeros > (state.fields[2] as bigint) ||
          (leadingZeros == (state.fields[2] as bigint) &&
            difficultyNumber < (state.fields[3] as bigint))
        ) {
          // Found a valid nonce so break out of the loop
          break;
        }

        incrementNonce(targetState);

        targetHash = await sha256(await sha256(targetState));
      }

      const realTimeNow = Number((Date.now() / 1000).toFixed(0)) * 1000 - 60000;

      const newMerkleRoot = '';

      let epochTime =
        (state.fields[4] as bigint) + BigInt(90000 + realTimeNow) - (state.fields[5] as bigint);

      let difficultyNumber = state.fields[3] as bigint;
      let leadingZeros = state.fields[2] as bigint;

      if ((state.fields[0] as bigint) % 2016n === 0n && (state.fields[0] as bigint) > 0) {
        const adjustment = getDifficultyAdjustement(epochTime, 1_209_600_000n);

        epochTime = 0n;

        const newDifficulty = calculateDifficultyNumber(
          {
            leadingZeros: state.fields[2] as bigint,
            difficultyNumber: state.fields[3] as bigint,
          },
          adjustment.numerator,
          adjustment.denominator,
        );

        difficultyNumber = newDifficulty.difficulty_number;
        leadingZeros = newDifficulty.leadingZeros;
      }

      // calculateDifficultyNumber();

      const postDatum = new Constr(0, [
        (state.fields[0] as bigint) + 1n,
        toHex(targetHash!),
        leadingZeros,
        difficultyNumber,
        epochTime,
        BigInt(90000 + realTimeNow),
        newMerkleRoot,
      ]);

      const outDat = Data.to(postDatum);

      console.log(`Found next datum: ${outDat}`);

      const mintTokens = {
        [tunav2ValidatorHash + fromText('TUNA')]: 5000000000n,
        [tunav2ValidatorHash +
        fromText('COUNTER') +
        ((state.fields[0] as bigint) + 1n).toString(16)]: 1n,
        [tunav2ValidatorHash + fromText('COUNTER') + (state.fields[0] as bigint).toString(16)]: -1n,
      };
      const masterTokens = {
        [tunav2ValidatorHash + fromText('TUNA') + tunav2SpendValidatorHash]: 1n,
        [tunav2ValidatorHash +
        fromText('COUNTER') +
        ((state.fields[0] as bigint) + 1n).toString(16)]: 1n,
      };
      try {
        // TODO - fix this to have the set of script utxos to run
        const readUtxo = await lucid.utxosByOutRef([
          {
            txHash: '01751095ea408a3ebe6083b4de4de8a24b635085183ab8a2ac76273ef8fff5dd',
            outputIndex: 0,
          },
        ]);

        // TODO merkle proof
        const minerRedeemer = Data.to(new Constr(0, [toHex(nonce), minerCredential, '']));

        const mintRedeemer = Data.to(
          new Constr(2, [
            new Constr(0, [new Constr(0, [minerOutput.txHash]), BigInt(minerOutput.outputIndex)]),
            state.fields[0] as bigint,
          ]),
        );

        const txMine = await lucid
          .newTx()
          .collectFrom([minerOutput], minerRedeemer)
          .payToAddressWithData(tunaV2ValidatorAddress, { inline: outDat }, masterTokens)
          .mintAssets(mintTokens, mintRedeemer)
          .readFrom(readUtxo)
          .validTo(realTimeNow + 180000)
          .validFrom(realTimeNow)
          .complete();

        const signed = await txMine.sign().complete();

        await signed.submit();

        console.log(`TX HASH: ${signed.toHash()}`);
        console.log('Waiting for confirmation...');

        // // await lucid.awaitTx(signed.toHash());
        await delay(5000);
      } catch (e) {
        console.log(e);
      }
    }
  });

app
  .command('genesis')
  .description('Create block 0')
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, ogmiosUrl, kupoUrl }) => {
    const unAppliedValidator = readValidator();

    const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Translucent.new(provider, preview ? 'Preview' : 'Mainnet');
    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    const utxos = await lucid.wallet.getUtxos();

    if (utxos.length === 0) {
      throw new Error('No UTXOs Found');
    }

    const initOutputRef = new Constr(0, [
      new Constr(0, [utxos[0].txHash]),
      BigInt(utxos[0].outputIndex),
    ]);

    const appliedValidator = applyParamsToScript(unAppliedValidator.script, [initOutputRef]);

    const validator: Script = {
      type: 'PlutusV2',
      script: appliedValidator,
    };

    const bootstrapHash = toHex(await sha256(await sha256(fromHex(Data.to(initOutputRef)))));

    const validatorAddress = lucid.utils.validatorToAddress(validator);

    const validatorHash = lucid.utils.validatorToScriptHash(validator);

    const masterToken = { [validatorHash + fromText('lord tuna')]: 1n };

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

      fs.writeFileSync(
        `genesis/${preview ? 'preview' : 'mainnet'}.json`,
        JSON.stringify({
          validator: validator.script,
          validatorHash,
          validatorAddress,
          bootstrapHash,
          datum,
          outRef: { txHash: utxos[0].txHash, index: utxos[0].outputIndex },
        }),
        { encoding: 'utf-8' },
      );
    } catch (e) {
      console.log(e);
    }
  });

app
  .command('fork')
  .description('Hard fork the v1 tuna to v2 tuna')
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, ogmiosUrl, kupoUrl }) => {
    const [fortunaV1, forkValidator, fortunaV2Mint, fortunaV2Spend] = readValidators();

    const precalculated_merkle_root = '';

    const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Translucent.new(provider, preview ? 'Preview' : 'Mainnet');
    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    const utxos = await lucid.wallet.getUtxos();

    if (utxos.length === 0) {
      throw new Error('No UTXOs Found');
    }

    const initOutputRef = new Constr(0, [
      new Constr(0, [utxos[0].txHash]),
      BigInt(utxos[0].outputIndex),
    ]);

    const fortunaV1Hash = lucid.utils.validatorToScriptHash(fortunaV1);

    const fortunaV1Address = lucid.utils.validatorToAddress(fortunaV1);

    const forkValidatorApplied: Script = {
      type: 'PlutusV2',
      script: applyParamsToScript(forkValidator.script, [initOutputRef, fortunaV1Hash]),
    };

    const forkValidatorHash = lucid.utils.validatorToScriptHash(forkValidatorApplied);

    const forkValidatorRewardAddress = lucid.utils.validatorToRewardAddress(forkValidatorApplied);

    const forkValidatorAddress = lucid.utils.validatorToAddress(forkValidatorApplied);

    const tunaV2MintApplied: Script = {
      type: 'PlutusV2',
      script: applyParamsToScript(fortunaV2Mint.script, [fortunaV1Hash, forkValidatorHash]),
    };

    const tunaV2MintAppliedHash = lucid.utils.validatorToScriptHash(tunaV2MintApplied);

    const tunaV2SpendApplied: Script = {
      type: 'PlutusV2',
      script: applyParamsToScript(fortunaV2Spend.script, [tunaV2MintAppliedHash]),
    };

    const tunaV2SpendAppliedHash = lucid.utils.validatorToScriptHash(tunaV2SpendApplied);

    const fortunaV2Address = lucid.utils.validatorToAddress(tunaV2SpendApplied);

    const lastestV1Block: UTxO = (
      await lucid.utxosAtWithUnit(fortunaV1Address, fortunaV1Hash + fromText('lord tuna'))
    )[0];

    const lastestV1BlockData = Data.from(lastestV1Block.datum!) as Constr<
      string | bigint | string[]
    >;

    const [
      bn,
      current_hash,
      leading_zeros,
      target_number,
      epoch_time,
      current_posix_time,
      ...rest
    ] = lastestV1BlockData.fields;

    const blockNumber = bn as bigint;

    const masterTokensV2 = {
      [tunaV2MintAppliedHash + fromText('TUNA') + tunaV2SpendAppliedHash]: 1n,
      [tunaV2MintAppliedHash + fromText('COUNTER') + blockNumber.toString(16)]: 1n,
    };

    const forkLockToken = {
      [forkValidatorHash + fromText('lock_state')]: 1n,
    };

    // LockState { block_height: block_number, current_locked_tuna: 0 }
    const lockState = Data.to(new Constr(0, [blockNumber, 0n]));

    // HardFork { lock_output_index }
    const forkRedeemer = Data.to(new Constr(0, [0n]));

    const forkMintRedeemer = Data.to(0n);

    //  Statev2 {
    //   block_number,
    //   current_hash,
    //   leading_zeros: leading_zeros - 2,
    //   target_number,
    //   epoch_time,
    //   current_posix_time,
    //   merkle_root: latest_merkle_root,
    // }
    const fortunaState = Data.to(
      new Constr(0, [
        blockNumber,
        current_hash,
        (leading_zeros as bigint) - 2n,
        target_number,
        epoch_time,
        current_posix_time,
        precalculated_merkle_root,
      ]),
    );

    const fortunaRedeemer = Data.to(new Constr(0, []));

    const tx = await lucid
      .newTx()
      .readFrom([lastestV1Block])
      .registerStake(forkValidatorRewardAddress)
      .withdraw(forkValidatorRewardAddress, 0n, forkRedeemer)
      .mintAssets(forkLockToken, forkMintRedeemer)
      .mintAssets(masterTokensV2, fortunaRedeemer)
      .payToContract(forkValidatorAddress, { inline: lockState }, forkLockToken)
      .payToContract(fortunaV2Address, { inline: fortunaState }, masterTokensV2)
      .complete();

    const signed = await tx.sign().complete();

    try {
      await signed.submit();

      console.log(`TX Hash: ${signed.toHash()}`);

      await lucid.awaitTx(signed.toHash());

      console.log(`Completed and saving genesis file.`);

      fs.writeFileSync(
        `genesisV2/${preview ? 'preview' : 'mainnet'}.json`,
        JSON.stringify({
          forkValidator: {
            validator: forkValidator.script,
            validatorHash: forkValidatorHash,
            validatorAddress: forkValidatorAddress,
            datum: lockState,
            outRef: { txHash: utxos[0].txHash, index: utxos[0].outputIndex },
          },
          tunaV2MintValidator: {
            validator: tunaV2MintApplied.script,
            validatorHash: tunaV2MintAppliedHash,
            validatorAddress: fortunaV2Address,
          },
          tunaV2SpendValidator: {
            validator: tunaV2SpendApplied.script,
            validatorHash: tunaV2SpendAppliedHash,
            validatorAddress: fortunaV2Address,
            datum: fortunaState,
          },
        }),
        { encoding: 'utf-8' },
      );
    } catch (e) {
      console.log(e);
    }
  });

app
  .command('init')
  .description('Initialize the miner')
  .action(() => {
    const seed = generateSeedPhrase();

    fs.writeFileSync('seed.txt', seed, { encoding: 'utf-8' });

    console.log(`Miner wallet initialized and saved to seed.txt`);
  });

app
  .command('address')
  .description('Check address balance')
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, ogmiosUrl, kupoUrl }) => {
    const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Translucent.new(provider, preview ? 'Preview' : 'Mainnet');

    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    const address = await lucid.wallet.address();

    const utxos = await lucid.wallet.getUtxos();

    const balance = utxos.reduce((acc, u) => {
      return acc + u.assets.lovelace;
    }, 0n);

    console.log(`Address: ${address}`);
    console.log(`ADA Balance: ${balance / 1_000_000n}`);

    try {
      const genesisFile = fs.readFileSync(`genesis/${preview ? 'preview' : 'mainnet'}.json`, {
        encoding: 'utf8',
      });

      const genesisFileV2 = fs.readFileSync(`genesisV2/${preview ? 'preview' : 'mainnet'}.json`, {
        encoding: 'utf8',
      });

      const { validatorHash }: Genesis = JSON.parse(genesisFile);
      const {
        tunaV2MintValidator: { validatorHash: validatorHashV2 },
      }: GenesisV2 = JSON.parse(genesisFileV2);

      const tunaBalance = utxos.reduce((acc, u) => {
        return acc + (u.assets[validatorHash + fromText('TUNA')] ?? 0n);
      }, 0n);

      const tunaV2Balance = utxos.reduce((acc, u) => {
        return acc + (u.assets[validatorHashV2 + fromText('TUNA')] ?? 0n);
      }, 0n);

      console.log(`TUNA Balance: ${tunaBalance / 100_000_000n}`);
      console.log(`TUNAV2 Balance: ${tunaV2Balance / 100_000_000n}`);
    } catch {
      console.log(`TUNA Balance: 0`);
    }

    process.exit(0);
  });

app
  .command('test')
  .description('does nothing')
  .action(async () => {
    console.log(plus100(3));
  });

app.parse();
