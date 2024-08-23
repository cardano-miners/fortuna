import { Argument, Command, Option } from '@commander-js/extra-typings';
import { CardanoSyncClient } from '@utxorpc/sdk';
import * as Cardano from '@utxorpc/spec/lib/utxorpc/v1alpha/cardano/cardano_pb.js';
import { BlockRef } from '@utxorpc/spec/lib/utxorpc/v1alpha/sync/sync_pb.js';
import crypto from 'crypto';
import 'dotenv/config';
import fs from 'fs';
import {
  Constr,
  Data,
  Lucid,
  UTxO,
  applyParamsToScript,
  fromHex,
  fromText,
  generateSeedPhrase,
  toHex,
  type Script,
  Blockfrost,
  Assets,
} from 'lucid-cardano';
import { WebSocket } from 'ws';

import {
  blake256,
  calculateDifficultyNumber,
  getDifficulty,
  getDifficultyAdjustement,
  incrementNonce,
  incrementNonceV2,
  readValidator,
  readValidators,
  readNewSpendValidator,
  sha256,
  calculateInterlink,
} from './utils';

import { Store, Trie } from '@aiken-lang/merkle-patricia-forestry';

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

type GenesisV3 = {
  tunaV3SpendValidator: {
    validator: string;
    validatorHash: string;
    validatorAddress: string;
  };
};

const delay = (ms: number | undefined) => new Promise((res) => setTimeout(res, ms));
const epochNumber = 504n;
const twoWeeks = 30_000_000n;
const halvingNumber = 210000n;

const app = new Command();

app.name('fortuna').description('Fortuna miner').version('0.0.2');

const utxoRpcUriOption = new Option('-u, --utxo-rpc-uri <string>', 'Utxo RPC URI')
  .env('UTXO_RPC_URI')
  .makeOptionMandatory(true);

const blockFrostOption = new Option('-b, --blockfrost-key <string>', 'Blockfrost Key')
  .env('BLOCKFROST_KEY')
  .makeOptionMandatory(true);

const utxoRpcApiKeyOption = new Option('-y, --utxo-rpc-api-key <string>', 'Utxo RPC API Key')
  .env('UTXO_RPC_API_KEY')
  .makeOptionMandatory(true);

const previewOption = new Option('-p, --preview', 'Use testnet').default(false);

const useV2History = new Option('-h, --useHistory', 'Use history of V2').default(false);

app
  .command('mineV1')
  .description('Start the miner')
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .action(async ({ preview, blockfrostKey }) => {
    const trueValue = true;

    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0/', blockfrostKey);

    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');

    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf8' }));

    while (trueValue) {
      const { validatorAddress, validator, validatorHash }: Genesis = JSON.parse(
        fs.readFileSync(`genesis/${preview ? 'preview' : 'mainnet'}.json`, {
          encoding: 'utf8',
        }),
      );

      let validatorUTXOs = await lucid.utxosAt(validatorAddress);

      let validatorOutRef = validatorUTXOs.find(
        (u) => u.assets[validatorHash + fromText('lord tuna')],
      )!;

      let validatorState = validatorOutRef.datum!;

      let state = Data.from(validatorState) as Constr<string | bigint | string[]>;

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
        difficultyNumber: bigint;
      };

      console.log('Mining...');
      let timer = new Date().valueOf();

      while (trueValue) {
        if (new Date().valueOf() - timer > 5000) {
          console.log('New block not found in 5 seconds, updating state');
          timer = new Date().valueOf();
          validatorUTXOs = await lucid.utxosAt(validatorAddress);

          validatorOutRef = validatorUTXOs.find(
            (u) => u.assets[validatorHash + fromText('lord tuna')],
          )!;

          if (validatorState !== validatorOutRef.datum!) {
            validatorState = validatorOutRef.datum!;

            state = Data.from(validatorState) as Constr<string | bigint | string[]>;

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

        targetHash = await sha256(await sha256(fromHex(Data.to(targetState))));

        difficulty = getDifficulty(targetHash);

        const { leadingZeros, difficultyNumber } = difficulty;

        if (
          leadingZeros > (state.fields[2] as bigint) ||
          (leadingZeros == (state.fields[2] as bigint) &&
            difficultyNumber < (state.fields[3] as bigint))
        ) {
          break;
        }

        incrementNonce(nonce);

        targetState.fields[0] = toHex(nonce);
      }

      const realTimeNow = lucid.utils.slotToUnixTime(lucid.currentSlot() - 90);

      const interlink = calculateInterlink(
        toHex(targetHash),
        difficulty,
        {
          leadingZeros: state.fields[2] as bigint,
          difficultyNumber: state.fields[3] as bigint,
        },
        state.fields[7] as string[],
      );

      let epoch_time =
        (state.fields[4] as bigint) + BigInt(90000 + realTimeNow) - (state.fields[5] as bigint);

      let difficulty_number = state.fields[3] as bigint;
      let leading_zeros = state.fields[2] as bigint;

      if ((state.fields[0] as bigint) % epochNumber === 0n && (state.fields[0] as bigint) > 0) {
        const adjustment = getDifficultyAdjustement(epoch_time, twoWeeks);

        epoch_time = 0n;

        const new_difficulty = calculateDifficultyNumber(
          {
            leadingZeros: state.fields[2] as bigint,
            difficultyNumber: state.fields[3] as bigint,
          },
          adjustment.numerator,
          adjustment.denominator,
        );

        difficulty_number = new_difficulty.difficultyNumber;
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
        fromText('AlL HaIl tUnA'),
        interlink,
      ]);

      const outDat = Data.to(postDatum);

      console.log(`Found next datum: ${outDat}`);

      const mintTokens = {
        [validatorHash + fromText('TUNA')]:
          5000000000n / 2n ** ((state.fields[0] as bigint) / halvingNumber),
      };
      const masterToken = { [validatorHash + fromText('lord tuna')]: 1n };

      try {
        const txMine = await lucid
          .newTx()
          .collectFrom([validatorOutRef], Data.to(new Constr(1, [toHex(nonce)])))
          .payToAddressWithData(validatorAddress, { inline: outDat }, masterToken)
          .mintAssets(mintTokens, Data.to(new Constr(0, [])))
          .validTo(realTimeNow + 180000)
          .validFrom(realTimeNow)
          .attachSpendingValidator({ script: validator, type: 'PlutusV2' })
          .complete();

        const signed = await txMine.sign().complete();

        await signed.submit();

        console.log(`TX HASH: ${signed.toHash()}`);
        console.log('Waiting for confirmation...');

        await lucid.awaitTx(signed.toHash());
        await delay(20000);
      } catch (e) {
        console.log(e);
      }
    }
  });

app
  .command('mine')
  .description('Start the miner')
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .action(async ({ preview, blockfrostKey }) => {
    const alwaysLoop = true;

    // Construct a new trie with on-disk storage under the file path 'db'.
    let trie: Trie = await Trie.load(new Store(preview ? 'dbPreview' : 'db'));

    const {
      tunaV2MintValidator: { validatorHash: tunav2ValidatorHash },
      tunaV2SpendValidator: {
        validatorHash: tunav2SpendValidatorHash,
        validatorAddress: tunaV2ValidatorAddress,
      },
      forkValidator: { validatorAddress: forkValidatorAddress },
    }: GenesisV2 = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0/', blockfrostKey);

    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');
    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf8' }));

    const userPkh = lucid.utils.getAddressDetails(await lucid.wallet.address()).paymentCredential!;

    const minerCredential = new Constr(0, [userPkh.hash, fromText('AlL HaIl tUnA')]);

    console.log(Data.to(minerCredential));

    const minerCredHash = blake256(fromHex(Data.to(minerCredential)));

    console.log('here');

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
                  // block_number: In
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

          trie = await trie.insert(Buffer.from(blake256(targetHash)), Buffer.from(targetHash));
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

        const { leadingZeros, difficultyNumber } = difficulty;

        if (
          leadingZeros > (state.fields[2] as bigint) ||
          (leadingZeros == (state.fields[2] as bigint) &&
            difficultyNumber < (state.fields[3] as bigint))
        ) {
          console.log(toHex(targetHash));
          console.log(toHex(targetState));
          // Found a valid nonce so break out of the loop
          nonce = targetState.slice(4, 20);
          break;
        }

        incrementNonceV2(targetState);

        targetHash = await sha256(await sha256(targetState));
      }

      const realTimeNow = Number((Date.now() / 1000).toFixed(0)) * 1000 - 60000;

      trie = await trie.insert(Buffer.from(blake256(targetHash)), Buffer.from(targetHash));

      const newMerkleRoot = trie.hash;

      let epochTime =
        (state.fields[4] as bigint) + BigInt(90000 + realTimeNow) - (state.fields[5] as bigint);

      let difficultyNumber = state.fields[3] as bigint;
      let leadingZeros = state.fields[2] as bigint;

      if ((state.fields[0] as bigint) % epochNumber === 0n && (state.fields[0] as bigint) > 0) {
        const adjustment = getDifficultyAdjustement(epochTime, twoWeeks);

        epochTime = 0n;

        const newDifficulty = calculateDifficultyNumber(
          {
            leadingZeros: state.fields[2] as bigint,
            difficultyNumber: state.fields[3] as bigint,
          },
          adjustment.numerator,
          adjustment.denominator,
        );

        difficultyNumber = newDifficulty.difficultyNumber;
        leadingZeros = newDifficulty.leadingZeros;
      }

      const postDatum = new Constr(0, [
        (state.fields[0] as bigint) + 1n,
        toHex(targetHash),
        leadingZeros,
        difficultyNumber,
        epochTime,
        BigInt(90000 + realTimeNow),
        toHex(newMerkleRoot),
      ]);

      const outDat = Data.to(postDatum);

      console.log(`Found next datum: ${outDat}`);

      const blockNumberHex =
        (state.fields[0] as bigint).toString(16).length % 2 === 0
          ? (state.fields[0] as bigint).toString(16)
          : `0${(state.fields[0] as bigint).toString(16)}`;

      const blockNumberHexNext =
        ((state.fields[0] as bigint) + 1n).toString(16).length % 2 === 0
          ? ((state.fields[0] as bigint) + 1n).toString(16)
          : `0${((state.fields[0] as bigint) + 1n).toString(16)}`;

      const mintTokens = {
        [tunav2ValidatorHash + fromText('TUNA')]:
          5000000000n / 2n ** ((state.fields[0] as bigint) / 210000n),
        [tunav2ValidatorHash + fromText('COUNTER') + blockNumberHex]: -1n,
        [tunav2ValidatorHash + fromText('COUNTER') + blockNumberHexNext]: 1n,
      };

      const masterTokens = {
        [tunav2ValidatorHash + fromText('COUNTER') + blockNumberHexNext]: 1n,
        [tunav2ValidatorHash + fromText('TUNA') + tunav2SpendValidatorHash]: 1n,
      };

      try {
        const readUtxos = await lucid.utxosAt(forkValidatorAddress);

        const merkleProof = Data.from(
          (await trie.prove(Buffer.from(blake256(targetHash)))).toCBOR().toString('hex'),
        );

        const minerRedeemer = Data.to(new Constr(0, [toHex(nonce), minerCredential, merkleProof]));

        console.log(minerRedeemer);

        const mintRedeemer = Data.to(
          new Constr(1, [
            new Constr(0, [new Constr(0, [minerOutput.txHash]), BigInt(minerOutput.outputIndex)]),
            state.fields[0] as bigint,
          ]),
        );

        const txMine = await lucid
          .newTx()
          .collectFrom([minerOutput], minerRedeemer)
          .payToContract(tunaV2ValidatorAddress, { inline: outDat }, masterTokens)
          .mintAssets(mintTokens, mintRedeemer)
          .addSigner(await lucid.wallet.address())
          .readFrom(readUtxos)
          .validTo(realTimeNow + 180000)
          .validFrom(realTimeNow)
          .complete();

        const signed = await txMine.sign().complete();

        await signed.submit();

        console.log(`TX HASH: ${signed.toHash()}`);
        console.log('Waiting for confirmation...');

        await lucid.awaitTx(signed.toHash());
        await delay(25000);
      } catch (e) {
        console.log(e);
        await trie.delete(Buffer.from(blake256(targetHash)));
      }
    }
  });

app
  .command('genesis')
  .description('Create block 0')
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .action(async ({ preview, blockfrostKey }) => {
    const unAppliedValidator = readValidator();

    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0', blockfrostKey);
    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');
    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    console.log(lucid.wallet.address());
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
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .action(async ({ preview, blockfrostKey }) => {
    const fortunaV1: Genesis = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'preview' : 'mainnet'}.json`, {
        encoding: 'utf8',
      }),
    );

    const [forkValidator, fortunaV2Mint, fortunaV2Spend] = readValidators();

    const forkMerkleRoot = fs.readFileSync(preview ? 'currentPreviewRoot.txt' : 'currentRoot.txt', {
      encoding: 'utf-8',
    });

    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0/', blockfrostKey);

    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');

    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    const utxos = (await lucid.wallet.getUtxos()).sort((a, b) => {
      return a.txHash.localeCompare(b.txHash) || a.outputIndex - b.outputIndex;
    });

    if (utxos.length === 0) {
      throw new Error('No UTXOs Found');
    }

    const initOutputRef = new Constr(0, [
      new Constr(0, [utxos[0].txHash]),
      BigInt(utxos[0].outputIndex),
    ]);

    const fortunaV1Hash = fortunaV1.validatorHash;

    const fortunaV1Address = fortunaV1.validatorAddress;

    const forkValidatorApplied: Script = {
      type: 'PlutusV2',
      script: applyParamsToScript(forkValidator.script, [initOutputRef, fortunaV1Hash]),
    };

    const forkValidatorHash = lucid.utils.validatorToScriptHash(forkValidatorApplied);

    console.log(forkValidatorHash);

    const forkValidatorRewardAddress = lucid.utils.validatorToRewardAddress(forkValidatorApplied);

    const forkValidatorAddress = lucid.utils.validatorToAddress(forkValidatorApplied);

    const readUtxos = await lucid.utxosAt(forkValidatorAddress);

    const tunaV2MintApplied: Script = {
      type: 'PlutusV2',
      script: applyParamsToScript(fortunaV2Mint.script, [fortunaV1Hash, forkValidatorHash]),
    };

    const tunaV2MintAppliedHash = lucid.utils.validatorToScriptHash(tunaV2MintApplied);

    const tunaV2MintAddress = lucid.utils.validatorToAddress(tunaV2MintApplied);

    console.log(tunaV2MintAppliedHash);

    const tunaV2SpendApplied: Script = {
      type: 'PlutusV2',
      script: applyParamsToScript(fortunaV2Spend.script, [tunaV2MintAppliedHash]),
    };

    const tunaV2SpendAppliedHash = lucid.utils.validatorToScriptHash(tunaV2SpendApplied);

    console.log(tunaV2SpendAppliedHash);

    const fortunaV2Address = lucid.utils.validatorToAddress(tunaV2SpendApplied);

    const lastestV1Block: UTxO = (
      await lucid.utxosAtWithUnit(fortunaV1Address, fortunaV1Hash + fromText('lord tuna'))
    )[0];

    const lastestV1BlockData = Data.from(lastestV1Block.datum!) as Constr<
      string | bigint | string[]
    >;

    const [bn, current_hash, leading_zeros, target_number, epoch_time, current_posix_time] =
      lastestV1BlockData.fields;

    const blockNumber = bn as bigint;

    const blockNumberHex =
      blockNumber.toString(16).length % 2 === 0
        ? blockNumber.toString(16)
        : `0${blockNumber.toString(16)}`;

    const masterTokensV2 = {
      [tunaV2MintAppliedHash + fromText('TUNA') + tunaV2SpendAppliedHash]: 1n,
      [tunaV2MintAppliedHash + fromText('COUNTER') + blockNumberHex]: 1n,
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
        forkMerkleRoot,
      ]),
    );

    console.log(
      'State',
      blockNumber,
      current_hash,
      (leading_zeros as bigint) - 2n,
      target_number,
      epoch_time,
      current_posix_time,
      forkMerkleRoot,
    );

    const fortunaRedeemer = Data.to(new Constr(0, []));

    try {
      // const txRegister = await lucid
      //   .newTx()
      //   .collectFrom([utxos.at(5)!])
      //   .registerStake(forkValidatorRewardAddress)
      //   .complete({ coinSelection: false });

      // const signedRegister = await txRegister.sign().complete();

      // await signedRegister.submit();

      // console.log(`TX Hash: ${signedRegister.toHash()}`);

      // await lucid.awaitTx(signedRegister.toHash());

      const tx = await lucid
        .newTx()
        .collectFrom([utxos.at(0)!])
        .readFrom([lastestV1Block, ...readUtxos])
        .withdraw(forkValidatorRewardAddress, 0n, forkRedeemer)
        .mintAssets(forkLockToken, forkMintRedeemer)
        .mintAssets(masterTokensV2, fortunaRedeemer)
        .payToContract(forkValidatorAddress, { inline: lockState }, forkLockToken)
        .payToContract(fortunaV2Address, { inline: fortunaState }, masterTokensV2)
        .complete();

      const signed = await tx.sign().complete();

      await signed.submit();

      console.log(`TX Hash: ${signed.toHash()}`);

      await lucid.awaitTx(signed.toHash());

      console.log(`Completed and saving genesis file.`);

      fs.writeFileSync(
        `genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`,
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
            validatorAddress: tunaV2MintAddress,
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
  .command('redeem')
  .description('Lock V1 Tuna and redeem V2 Tuna')
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .addArgument(
    new Argument('<amount>', 'Amount of V1 Tuna to lock').argParser((val) => BigInt(val)),
  )
  .action(async (amount, { preview, blockfrostKey }) => {
    const fortunaV1: Genesis = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'preview' : 'mainnet'}.json`, {
        encoding: 'utf8',
      }),
    );

    const {
      tunaV2MintValidator: { validatorHash: tunav2ValidatorHash },
      forkValidator: { validatorAddress: forkValidatorAddress, validatorHash: forkValidatorHash },
    }: GenesisV2 = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0/', blockfrostKey);

    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');
    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    const rewardAddress = lucid.utils.credentialToRewardAddress(
      lucid.utils.scriptHashToCredential(forkValidatorHash),
    );
    try {
      const forkUtxos = await lucid.utxosAt(forkValidatorAddress);

      // Does this work and actually mutate readUtxos?
      const lockUtxo = forkUtxos.find((utxo) => {
        return utxo.assets[forkValidatorHash + fromText('lock_state')] === 1n;
      })!;

      const readUtxos = forkUtxos.filter((utxo) => {
        return utxo.assets[forkValidatorHash + fromText('lock_state')] !== 1n;
      })!;

      const prevState = Data.from(lockUtxo.datum!) as Constr<bigint>;

      const lockRedeemer = Data.to(new Constr(1, [0n, amount]));

      const tunaRedeemer = Data.to(new Constr(2, []));

      const newLockState = Data.to(
        new Constr(0, [prevState.fields[0], prevState.fields[1] + amount]),
      );

      const spendRedeemer = Data.to(new Constr(1, [0n]));

      const masterLockToken = {
        [forkValidatorHash + fromText('lock_state')]: 1n,
        [fortunaV1.validatorHash + fromText('TUNA')]: prevState.fields[1] + amount,
      };

      const mintTokens = { [tunav2ValidatorHash + fromText('TUNA')]: amount };

      const tx = await lucid
        .newTx()
        .readFrom(readUtxos)
        .collectFrom([lockUtxo], spendRedeemer)
        .payToContract(forkValidatorAddress, { inline: newLockState }, masterLockToken)
        .mintAssets(mintTokens, tunaRedeemer)
        .withdraw(rewardAddress, 0n, lockRedeemer)
        .addSigner(await lucid.wallet.address())
        .complete({ nativeUplc: false });

      const signed = await tx.sign().complete();

      await signed.submit();

      console.log(`TX HASH: ${signed.toHash()}`);
      console.log('Waiting for confirmation...');

      await lucid.awaitTx(signed.toHash());
      // await delay(5000);
    } catch (e) {
      console.log(e);
    }
  });

app
  .command('setup')
  .description('Create script refs')
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .action(async ({ preview, blockfrostKey }) => {
    const fortunaV1: Genesis = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'preview' : 'mainnet'}.json`, {
        encoding: 'utf8',
      }),
    );

    const [forkValidator, fortunaV2Mint, fortunaV2Spend] = readValidators();

    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0/', blockfrostKey);
    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');

    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    // const tx_test = await lucid
    //   .newTx()
    //   .payToAddress(await lucid.wallet.address(), { lovelace: 800000000n })
    //   .payToAddress(await lucid.wallet.address(), { lovelace: 800000000n })
    //   .complete();

    // const signed_test = await tx_test.sign().complete();

    // await signed_test.submit();

    // console.log(signed_test.toHash());

    // await lucid.awaitTx(signed_test.toHash());

    // await delay(10000);

    const utxos = (await lucid.wallet.getUtxos()).sort((a, b) => {
      return a.txHash.localeCompare(b.txHash) || a.outputIndex - b.outputIndex;
    });

    if (utxos.length === 0) {
      throw new Error('No UTXOs Found');
    }

    const initOutputRef = new Constr(0, [
      new Constr(0, [utxos[0].txHash]),
      BigInt(utxos[0].outputIndex),
    ]);

    const fortunaV1Hash = fortunaV1.validatorHash;

    const forkValidatorApplied: Script = {
      type: 'PlutusV2',
      script: applyParamsToScript(forkValidator.script, [initOutputRef, fortunaV1Hash]),
    };

    const forkValidatorHash = lucid.utils.validatorToScriptHash(forkValidatorApplied);

    const forkValidatorAddress = lucid.utils.validatorToAddress(forkValidatorApplied);

    const forkValidatorRewardAddress = lucid.utils.validatorToRewardAddress(forkValidatorApplied);

    const tunaV2MintApplied: Script = {
      type: 'PlutusV2',
      script: applyParamsToScript(fortunaV2Mint.script, [fortunaV1Hash, forkValidatorHash]),
    };

    const tunaV2MintAppliedHash = lucid.utils.validatorToScriptHash(tunaV2MintApplied);

    const tunaV2SpendApplied: Script = {
      type: 'PlutusV2',
      script: applyParamsToScript(fortunaV2Spend.script, [tunaV2MintAppliedHash]),
    };

    try {
      const tx = await lucid
        .newTx()
        .collectFrom([utxos.at(1)!])
        .payToAddressWithData(forkValidatorAddress, { scriptRef: forkValidatorApplied }, {})
        .payToAddressWithData(forkValidatorAddress, { scriptRef: tunaV2SpendApplied }, {})
        .complete({ coinSelection: true });

      const signed = await tx.sign().complete();

      await signed.submit();

      console.log(`TX Hash: ${signed.toHash()}`);

      await lucid.awaitTx(signed.toHash());

      await lucid.awaitTx(signed.toHash());

      await delay(20000);

      const tx2 = await lucid
        .newTx()
        .collectFrom([
          (await lucid.wallet.getUtxos())
            .sort((a, b) => {
              return a.txHash.localeCompare(b.txHash) || a.outputIndex - b.outputIndex;
            })
            .at(1)!,
        ])
        .payToAddressWithData(forkValidatorAddress, { scriptRef: tunaV2MintApplied }, {})
        .registerStake(forkValidatorRewardAddress)
        .complete({ coinSelection: true });

      const signed2 = await tx2.sign().complete();

      await signed2.submit();

      console.log(`TX Hash: ${signed2.toHash()}`);

      await lucid.awaitTx(signed2.toHash());
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
  .command('createMerkleRoot')
  .description('Create and output the merkle root of the fortuna blockchain')
  .addOption(previewOption)
  .addOption(utxoRpcUriOption)
  .addOption(utxoRpcApiKeyOption)
  .addOption(useV2History)
  .action(async ({ useHistory, preview, utxoRpcUri, utxoRpcApiKey }) => {
    // Construct a new trie with on-disk storage under the file path 'db'.
    let trie = new Trie(new Store(preview ? 'dbPreview' : 'db'));

    const {
      tunaV2MintValidator: { validatorHash: tunav2ValidatorHash },
      tunaV2SpendValidator: { validatorHash: tunav2SpendValidatorHash },
    }: GenesisV2 = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const client = new CardanoSyncClient({
      uri: utxoRpcUri,
      headers: {
        'dmtr-api-key': utxoRpcApiKey,
      },
    });
    let nextToken: BlockRef | undefined = new BlockRef({
      index: 68696872n,
      hash: fromHex('9afa726a18ab749fcb0ffa94e0b6aa52bef33d811d81ea9b57700794c919e15d'),
    });

    const headerHashes = JSON.parse(
      fs.readFileSync(preview ? 'V1PreviewHistory.json' : 'V1History.json', 'utf8'),
    );

    for (const header of headerHashes) {
      const hash = blake256(fromHex(header.current_hash as string));

      trie = await trie.insert(
        Buffer.from(hash),
        Buffer.from(fromHex(header.current_hash as string)),
      );
    }

    const rootPreFork = trie.hash.toString('hex');

    console.log(rootPreFork);

    if (useHistory) {
      do {
        const resp = await client.inner.dumpHistory({
          startToken: nextToken,
          maxItems: 25,
        });

        nextToken = resp.nextToken;

        for (const block of resp.block) {
          if (block.chain.case !== 'cardano') {
            return;
          }

          for (const tx of block.chain.value.body!.tx) {
            for (const output of tx.outputs) {
              if (
                output.assets.some((asset) => {
                  return (
                    toHex(asset.policyId) === tunav2ValidatorHash &&
                    asset.assets.some(
                      (asset) => toHex(asset.name) === fromText('TUNA') + tunav2SpendValidatorHash,
                    )
                  );
                })
              ) {
                const datum = output.datum!.payload!.plutusData.value! as Cardano.Constr;

                const currentHash = toHex(datum.fields[1].plutusData.value! as Uint8Array);

                console.log('CURRENT HASH', currentHash);

                try {
                  trie = await trie.insert(
                    Buffer.from(blake256(fromHex(currentHash))),
                    Buffer.from(fromHex(currentHash)),
                  );
                } catch (e) {
                  console.log(e);
                }

                const root = trie.hash.toString('hex');

                console.log(root);
              }
            }
          }
        }
      } while (!!nextToken);
    }

    const root = trie.hash.toString('hex');

    console.log(trie.hash.toString('hex'));

    fs.writeFileSync(preview ? 'currentPreviewRoot.txt' : 'currentRoot.txt', root, {
      encoding: 'utf-8',
    });

    console.log(`Current root written to currentRoot.txt`);
  });

app
  .command('address')
  .description('Check address balance')
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .action(async ({ preview, blockfrostKey }) => {
    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0/', blockfrostKey);

    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');

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

      const genesisFileV2 = fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
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

      console.log(`TUNA Balance: ${Number(tunaBalance) / 100_000_000}`);
      console.log(`TUNAV2 Balance: ${Number(tunaV2Balance) / 100_000_000}`);
    } catch {
      console.log(`TUNA Balance: 0`);
    }

    process.exit(0);
  });

app
  .command('nominate')
  .description('Nominate a new Fortuna Spending Contract')
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .action(async ({ preview, blockfrostKey }) => {
    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0/', blockfrostKey);

    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');

    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    const {
      tunaV2MintValidator: { validatorHash: tunav2ValidatorHash, validator: tunav2Validator },
      forkValidator: { validatorAddress: forkValidatorAddress },
    }: GenesisV2 = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const newSpend = readNewSpendValidator();

    const tunaV2RealAddress = lucid.utils.validatorToAddress({
      script: tunav2Validator,
      type: 'PlutusV2',
    });

    const utxos = (await lucid.wallet.getUtxos()).sort((a, b) => {
      return a.txHash.localeCompare(b.txHash) || a.outputIndex - b.outputIndex;
    });

    const utxoRef = utxos[0];

    const newSpendApplied = applyParamsToScript(newSpend.script, [
      tunav2ValidatorHash,
      new Constr(0, [new Constr(0, [utxoRef.txHash]), BigInt(utxoRef.outputIndex)]),
    ]);

    const newSpendScript: Script = { script: newSpendApplied, type: 'PlutusV2' };

    const newSpendAddress = lucid.utils.validatorToAddress(newSpendScript);
    const newSpendHash = lucid.utils.validatorToScriptHash(newSpendScript);

    // NominateUpgrade(validatorHash, outputIndex)
    const mintNominateRedeemer = new Constr(3, [newSpendHash, 0n]);

    const spendNominateRedeemer = new Constr(2, []);

    const antiScriptHash = toHex(
      fromHex(newSpendHash).map((i) => {
        return i ^ 0xff;
      }),
    );

    const realTimeNow = Number((Date.now() / 1000).toFixed(0)) * 1000 - 60000;

    const spendOutputNominateDatum = new Constr(0, [
      newSpendHash,
      0n,
      antiScriptHash,
      0n,
      // 20 minutes for testing
      BigInt(realTimeNow + 1000 * 60 * 20),
    ]);

    try {
      const setupTx = await lucid
        .newTx()
        .collectFrom([utxos[1]])
        .payToContract(
          newSpendAddress,
          { inline: Data.to(0n), scriptRef: newSpendScript },
          { lovelace: 50n },
        )
        .complete();
      console.log('here');

      const setupTxSigned = await setupTx.sign().complete();

      await setupTxSigned.submit();

      await lucid.awaitTx(setupTxSigned.toHash());

      await delay(10000);

      console.log(setupTxSigned.toHash());

      const contractUtxo = await lucid.utxosAt(newSpendAddress);

      console.log('here2');

      const readUtxos = await lucid.utxosAt(forkValidatorAddress);

      const nominateTx = await lucid
        .newTx()
        .readFrom(readUtxos)
        .collectFrom(contractUtxo, Data.to(spendNominateRedeemer))
        .collectFrom([utxos[0]])
        .mintAssets(
          { [tunav2ValidatorHash + fromText('NOMA') + newSpendHash]: 1n },
          Data.to(mintNominateRedeemer),
        )
        .payToContract(
          tunaV2RealAddress,
          { inline: Data.to(spendOutputNominateDatum) },
          { [tunav2ValidatorHash + fromText('NOMA') + newSpendHash]: 1n },
        )
        .validFrom(realTimeNow)
        .validTo(realTimeNow + 170000)
        .complete();

      console.log('here3');

      const nominateTxSigned = await nominateTx.sign().complete();

      await nominateTxSigned.submit();

      console.log(`Nominated new spending contract: ${newSpendHash}`);

      console.log(nominateTxSigned.toHash());

      await lucid.awaitTx(nominateTxSigned.toHash());

      console.log(`Completed and saving governance file.`);

      fs.writeFileSync(
        `governance/${preview ? 'previewV2' : 'mainnetV2'}.json`,
        JSON.stringify({
          tunaV3SpendValidator: {
            validator: newSpendScript,
            validatorHash: newSpendHash,
            validatorAddress: newSpendAddress,
          },
        }),
        { encoding: 'utf-8' },
      );
    } catch (e) {
      console.log(e);
    }
  });

app
  .command('mintVoteTokens')
  .description('Mint a marker token for Voting')
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .action(async ({ preview, blockfrostKey }) => {
    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0/', blockfrostKey);

    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');

    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    const {
      tunaV2MintValidator: { validatorHash: tunav2ValidatorHash, validator: tunav2Validator },
      forkValidator: { validatorAddress: forkValidatorAddress },
    }: GenesisV2 = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const {
      tunaV3SpendValidator: { validatorHash: tunaV3SpendHash },
    }: GenesisV3 = JSON.parse(
      fs.readFileSync(`governance/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const tunaV2RealAddress = lucid.utils.validatorToAddress({
      script: tunav2Validator,
      type: 'PlutusV2',
    });

    const readUtxos = await lucid.utxosAt(forkValidatorAddress);

    const voteStateUtxo = (await lucid.utxosAt(tunaV2RealAddress)).filter((x) => {
      return x.assets[tunav2ValidatorHash + fromText('NOMA') + tunaV3SpendHash] === 1n;
    })[0];

    const mintVoteForRedeemer = new Constr(4, [
      new Constr(0, [new Constr(0, [voteStateUtxo.txHash]), BigInt(voteStateUtxo.outputIndex)]),
    ]);

    console.log(tunaV3SpendHash);

    try {
      const setupTx = await lucid
        .newTx()
        .readFrom([voteStateUtxo, ...readUtxos])
        .mintAssets({ [tunav2ValidatorHash + tunaV3SpendHash]: 1n }, Data.to(mintVoteForRedeemer))
        .complete();
      console.log('here');

      const setupTxSigned = await setupTx.sign().complete();

      await setupTxSigned.submit();

      await lucid.awaitTx(setupTxSigned.toHash());

      console.log(setupTxSigned.toHash());
    } catch (e) {
      console.log(e);
    }
  });

app
  .command('mintVoteAgainstTokens')
  .description('Mint a marker token for Against Voting')
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .action(async ({ preview, blockfrostKey }) => {
    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0/', blockfrostKey);

    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');

    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    const {
      tunaV2MintValidator: {
        validatorHash: tunav2ValidatorHash,

        validator: tunav2Validator,
      },
      forkValidator: { validatorAddress: forkValidatorAddress },
    }: GenesisV2 = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const {
      tunaV3SpendValidator: { validatorHash: tunaV3SpendHash },
    }: GenesisV3 = JSON.parse(
      fs.readFileSync(`governance/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const antiScriptHash = toHex(
      fromHex(tunaV3SpendHash).map((i) => {
        return i ^ 0xff;
      }),
    );

    const tunaV2RealAddress = lucid.utils.validatorToAddress({
      script: tunav2Validator,
      type: 'PlutusV2',
    });

    const readUtxos = await lucid.utxosAt(forkValidatorAddress);

    const voteStateUtxo = (await lucid.utxosAt(tunaV2RealAddress)).filter((x) => {
      return x.assets[tunav2ValidatorHash + fromText('NOMA') + tunaV3SpendHash] === 1n;
    })[0];

    const mintVoteForRedeemer = new Constr(4, [
      new Constr(0, [new Constr(0, [voteStateUtxo.txHash]), BigInt(voteStateUtxo.outputIndex)]),
    ]);

    try {
      const setupTx = await lucid
        .newTx()
        .readFrom([voteStateUtxo])
        .readFrom(readUtxos)
        .mintAssets({ [tunav2ValidatorHash + antiScriptHash]: 1n }, Data.to(mintVoteForRedeemer))
        .complete();
      console.log('here');

      const setupTxSigned = await setupTx.sign().complete();

      await setupTxSigned.submit();

      await lucid.awaitTx(setupTxSigned.toHash());

      console.log(setupTxSigned.toHash());
    } catch (e) {
      console.log(e);
    }
  });

app
  .command('countForVote')
  .description('count referenced Utxos in Voting')
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .action(async ({ preview, blockfrostKey }) => {
    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0/', blockfrostKey);

    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');

    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    const {
      tunaV2MintValidator: {
        validatorHash: tunav2ValidatorHash,

        validator: tunav2Validator,
      },
      forkValidator: { validatorAddress: forkValidatorAddress },
    }: GenesisV2 = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const {
      tunaV3SpendValidator: { validatorHash: tunaV3SpendHash },
    }: GenesisV3 = JSON.parse(
      fs.readFileSync(`governance/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const tunaV2RealAddress = lucid.utils.validatorToAddress({
      script: tunav2Validator,
      type: 'PlutusV2',
    });

    const walletUtxos = await lucid.wallet.getUtxos();
    console.log('HERE');

    const nonAdaValue: Assets = {};

    walletUtxos.forEach((utxo) => {
      Object.entries(utxo.assets).forEach((asset) => {
        const [name, amount] = asset;
        if (name === tunav2ValidatorHash + fromText('TUNA')) {
          nonAdaValue[name] = !!nonAdaValue[name] ? nonAdaValue[name] + amount : amount;
        }
      });
    });

    const totalTuna = nonAdaValue[tunav2ValidatorHash + fromText('TUNA')];

    const readUtxos = await lucid.utxosAt(forkValidatorAddress);

    const voteStateUtxo = (await lucid.utxosAt(tunaV2RealAddress)).filter((x) => {
      return x.assets[tunav2ValidatorHash + fromText('NOMA') + tunaV3SpendHash] === 1n;
    })[0];

    const [script_hash, for_count, anti_script_hash, against_count, deadline] = (
      Data.from(voteStateUtxo.datum!) as Constr<string | bigint>
    ).fields;

    const voteSpendRedeemer = new Constr(1, [new Constr(0, [])]);

    console.log('Input Datum', script_hash, for_count, anti_script_hash, against_count, deadline);
    console.log(totalTuna);

    // Nominated {
    //   script_hash: ByteArray,
    //   for_count: Int,
    //   anti_script_hash: ByteArray,
    //   against_count: Int,
    //   deadline: Int,
    // }
    const voteStateOutputDatum = new Constr(0, [
      script_hash,
      (for_count as bigint) + totalTuna,
      anti_script_hash,
      against_count,
      deadline,
    ]);

    try {
      const setupTx = await lucid
        .newTx()
        .payToAddress(await lucid.wallet.address(), {
          [tunav2ValidatorHash + fromText('TUNA')]: totalTuna / 2n,
          [tunav2ValidatorHash + tunaV3SpendHash]: 1n,
        })
        .payToAddress(
          lucid.utils.credentialToAddress(
            lucid.utils.getAddressDetails(await lucid.wallet.address()).paymentCredential!,
            { hash: tunaV3SpendHash, type: 'Script' },
          ),
          {
            [tunav2ValidatorHash + fromText('TUNA')]: totalTuna / 2n,
          },
        )
        .complete();

      const setupTxSigned = await setupTx.sign().complete();

      await setupTxSigned.submit();

      console.log(setupTxSigned.toHash());

      await lucid.awaitTx(setupTxSigned.toHash());

      await delay(20000);

      const realTimeNow = Number((Date.now() / 1000).toFixed(0)) * 1000;

      const tx = await lucid
        .newTx()
        .readFrom(readUtxos)
        .readFrom(
          await lucid.utxosAt(
            lucid.utils.credentialToAddress(
              lucid.utils.getAddressDetails(await lucid.wallet.address()).paymentCredential!,
              { hash: tunaV3SpendHash, type: 'Script' },
            ),
          ),
        )
        .readFrom(await lucid.wallet.getUtxos())
        .collectFrom([voteStateUtxo], Data.to(voteSpendRedeemer))
        .payToContract(
          tunaV2RealAddress,
          { inline: Data.to(voteStateOutputDatum) },
          { [tunav2ValidatorHash + fromText('NOMA') + tunaV3SpendHash]: 1n },
        )
        .validTo(realTimeNow + 80000)
        .complete();
      console.log('here');

      const txSigned = await tx.sign().complete();

      await txSigned.submit();

      console.log(txSigned.toHash());
      await lucid.awaitTx(txSigned.toHash());

      const cleanUpTx = await lucid
        .newTx()
        .collectFrom(
          await lucid.utxosAt(
            lucid.utils.credentialToAddress(
              lucid.utils.getAddressDetails(await lucid.wallet.address()).paymentCredential!,
              { hash: tunaV3SpendHash, type: 'Script' },
            ),
          ),
        )
        .addSigner(await lucid.wallet.address())
        .complete();

      console.log('here3');

      const txCleanUpSigned = await cleanUpTx.sign().complete();

      await txCleanUpSigned.submit();

      console.log(txCleanUpSigned.toHash());
      await lucid.awaitTx(txCleanUpSigned.toHash());
    } catch (e) {
      console.log(e);
    }
  });

app
  .command('countForAgainstVotes')
  .description('count referenced Utxos in Voting')
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .action(async ({ preview, blockfrostKey }) => {
    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0/', blockfrostKey);

    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');

    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    const {
      tunaV2MintValidator: {
        validatorHash: tunav2ValidatorHash,

        validator: tunav2Validator,
      },
      forkValidator: { validatorAddress: forkValidatorAddress },
    }: GenesisV2 = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const {
      tunaV3SpendValidator: { validatorHash: tunaV3SpendHash },
    }: GenesisV3 = JSON.parse(
      fs.readFileSync(`governance/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const tunaV2RealAddress = lucid.utils.validatorToAddress({
      script: tunav2Validator,
      type: 'PlutusV2',
    });

    const walletUtxos = await lucid.wallet.getUtxos();
    console.log('HERE');

    const nonAdaValue: Assets = {};

    walletUtxos.forEach((utxo) => {
      Object.entries(utxo.assets).forEach((asset) => {
        const [name, amount] = asset;
        if (name === tunav2ValidatorHash + fromText('TUNA')) {
          nonAdaValue[name] = !!nonAdaValue[name] ? nonAdaValue[name] + amount : amount;
        }
      });
    });

    const totalTuna = nonAdaValue[tunav2ValidatorHash + fromText('TUNA')];

    const readUtxos = await lucid.utxosAt(forkValidatorAddress);

    const voteStateUtxo = (await lucid.utxosAt(tunaV2RealAddress)).filter((x) => {
      return x.assets[tunav2ValidatorHash + fromText('NOMA') + tunaV3SpendHash] === 1n;
    })[0];

    const [script_hash, for_count, anti_script_hash, against_count, deadline] = (
      Data.from(voteStateUtxo.datum!) as Constr<string | bigint>
    ).fields;

    const voteSpendRedeemer = new Constr(1, [new Constr(0, [])]);
    const voteSpendRedeemer2 = new Constr(1, [new Constr(1, [])]);

    console.log('Input Datum', script_hash, for_count, anti_script_hash, against_count, deadline);
    console.log('TOTAL TUNA FOUND', totalTuna);

    // Nominated {
    //   script_hash: ByteArray,
    //   for_count: Int,
    //   anti_script_hash: ByteArray,
    //   against_count: Int,
    //   deadline: Int,
    // }
    const voteStateOutputDatum = new Constr(0, [
      script_hash,
      (for_count as bigint) + totalTuna / 2n,
      anti_script_hash,
      against_count,
      deadline,
    ]);

    const voteStateOutputDatum2 = new Constr(0, [
      script_hash,
      (for_count as bigint) + totalTuna / 2n,
      anti_script_hash,
      (against_count as bigint) + totalTuna / 2n,
      deadline,
    ]);

    try {
      const setupTx = await lucid
        .newTx()
        .payToAddress(await lucid.wallet.address(), {
          [tunav2ValidatorHash + fromText('TUNA')]: totalTuna / 4n,
          [tunav2ValidatorHash + tunaV3SpendHash]: 1n,
        })
        .payToAddress(
          lucid.utils.credentialToAddress(
            lucid.utils.getAddressDetails(await lucid.wallet.address()).paymentCredential!,
            { hash: tunaV3SpendHash, type: 'Script' },
          ),
          {
            [tunav2ValidatorHash + fromText('TUNA')]: totalTuna / 4n,
          },
        )
        .payToAddress(await lucid.wallet.address(), {
          [tunav2ValidatorHash + fromText('TUNA')]: totalTuna / 4n,
          [tunav2ValidatorHash + (anti_script_hash as string)]: 1n,
        })
        .payToAddress(
          lucid.utils.credentialToAddress(
            lucid.utils.getAddressDetails(await lucid.wallet.address()).paymentCredential!,
            { hash: anti_script_hash as string, type: 'Script' },
          ),
          {
            [tunav2ValidatorHash + fromText('TUNA')]: totalTuna / 4n,
          },
        )
        .payToAddress(await lucid.wallet.address(), { lovelace: 90000000n })
        .complete();

      const setupTxSigned = await setupTx.sign().complete();

      await setupTxSigned.submit();

      console.log(setupTxSigned.toHash());

      await lucid.awaitTx(setupTxSigned.toHash());

      await delay(20000);

      const realTimeNow = Number((Date.now() / 1000).toFixed(0)) * 1000;

      const tx = await lucid
        .newTx()
        .readFrom(readUtxos)
        .readFrom(
          await lucid.utxosAt(
            lucid.utils.credentialToAddress(
              lucid.utils.getAddressDetails(await lucid.wallet.address()).paymentCredential!,
              { hash: tunaV3SpendHash, type: 'Script' },
            ),
          ),
        )
        .readFrom(await lucid.wallet.getUtxos())
        .collectFrom([voteStateUtxo], Data.to(voteSpendRedeemer))
        .payToContract(
          tunaV2RealAddress,
          { inline: Data.to(voteStateOutputDatum) },
          { [tunav2ValidatorHash + fromText('NOMA') + tunaV3SpendHash]: 1n },
        )
        .validTo(realTimeNow + 80000)
        .complete();

      console.log('here');

      const txSigned = await tx.sign().complete();

      await txSigned.submit();

      console.log(txSigned.toHash());
      await lucid.awaitTx(txSigned.toHash());

      await delay(20000);

      const voteStateUtxo2 = (await lucid.utxosAt(tunaV2RealAddress)).filter((x) => {
        return x.assets[tunav2ValidatorHash + fromText('NOMA') + tunaV3SpendHash] === 1n;
      })[0];

      const realTimeNow2 = Number((Date.now() / 1000).toFixed(0)) * 1000;

      const againstTx = await lucid
        .newTx()
        .readFrom(readUtxos)
        .readFrom(
          await lucid.utxosAt(
            lucid.utils.credentialToAddress(
              lucid.utils.getAddressDetails(await lucid.wallet.address()).paymentCredential!,
              { hash: anti_script_hash as string, type: 'Script' },
            ),
          ),
        )
        .readFrom(await lucid.wallet.getUtxos())
        .collectFrom([voteStateUtxo2], Data.to(voteSpendRedeemer2))
        .payToContract(
          tunaV2RealAddress,
          { inline: Data.to(voteStateOutputDatum2) },
          { [tunav2ValidatorHash + fromText('NOMA') + tunaV3SpendHash]: 1n },
        )
        .validTo(realTimeNow2 + 80000)
        .complete();

      console.log('here here');

      const againstSigned = await againstTx.sign().complete();

      await againstSigned.submit();

      console.log(againstSigned.toHash());
      await lucid.awaitTx(againstSigned.toHash());

      const cleanUpTx = await lucid
        .newTx()
        .collectFrom(
          await lucid.utxosAt(
            lucid.utils.credentialToAddress(
              lucid.utils.getAddressDetails(await lucid.wallet.address()).paymentCredential!,
              { hash: tunaV3SpendHash, type: 'Script' },
            ),
          ),
        )
        .collectFrom(
          await lucid.utxosAt(
            lucid.utils.credentialToAddress(
              lucid.utils.getAddressDetails(await lucid.wallet.address()).paymentCredential!,
              { hash: anti_script_hash as string, type: 'Script' },
            ),
          ),
        )
        .addSigner(await lucid.wallet.address())
        .complete();

      console.log('here3');

      const txCleanUpSigned = await cleanUpTx.sign().complete();

      await txCleanUpSigned.submit();

      console.log(txCleanUpSigned.toHash());
      await lucid.awaitTx(txCleanUpSigned.toHash());
    } catch (e) {
      console.log(e);
    }
  });

app
  .command('cancelNomination')
  .description('Cancel a nomination that did not pass the vote')
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .action(async ({ preview, blockfrostKey }) => {
    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0/', blockfrostKey);

    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');

    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    const {
      tunaV2MintValidator: { validatorHash: tunav2ValidatorHash, validator: tunav2Validator },
      forkValidator: { validatorAddress: forkValidatorAddress },
      tunaV2SpendValidator: { validatorAddress: spendAddress, validatorHash: spendHash },
    }: GenesisV2 = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const lordTunaUtxo = await lucid.utxosAtWithUnit(
      spendAddress,
      tunav2ValidatorHash + fromText('TUNA') + spendHash,
    );

    const {
      tunaV3SpendValidator: { validatorHash: tunaV3SpendHash },
    }: GenesisV3 = JSON.parse(
      fs.readFileSync(`governance/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const tunaV2RealAddress = lucid.utils.validatorToAddress({
      script: tunav2Validator,
      type: 'PlutusV2',
    });

    const readUtxos = await lucid.utxosAt(forkValidatorAddress);

    const voteStateUtxo = (await lucid.utxosAt(tunaV2RealAddress)).filter((x) => {
      return x.assets[tunav2ValidatorHash + fromText('NOMA') + tunaV3SpendHash] === 1n;
    })[0];

    const lordTunaDatum = Data.from(lordTunaUtxo[0].datum!) as Constr<bigint>;

    const blockNumber = lordTunaDatum.fields[0];

    const spendRedeemer = new Constr(1, [new Constr(3, [blockNumber])]);

    const mintRedeemer = new Constr(5, []);
    const realTimeNow = Number((Date.now() / 1000).toFixed(0)) * 1000 - 60000;

    try {
      const setupTx = await lucid
        .newTx()
        .collectFrom([voteStateUtxo], Data.to(spendRedeemer))
        .readFrom(readUtxos)
        .readFrom(lordTunaUtxo)
        .mintAssets(
          {
            [tunav2ValidatorHash + fromText('NOMA') + tunaV3SpendHash]: -1n,
          },
          Data.to(mintRedeemer),
        )
        .validFrom(realTimeNow)
        .complete();

      console.log('here');

      const setupTxSigned = await setupTx.sign().complete();

      await setupTxSigned.submit();

      await lucid.awaitTx(setupTxSigned.toHash());

      console.log(setupTxSigned.toHash());
    } catch (e) {
      console.log(e);
    }
  });

app
  .command('transitionNomination')
  .description('Transition Nomination to the next stage')
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .action(async ({ preview, blockfrostKey }) => {
    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0/', blockfrostKey);

    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');

    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    const {
      tunaV2MintValidator: { validatorHash: tunav2ValidatorHash, validator: tunav2Validator },
      forkValidator: { validatorAddress: forkValidatorAddress },
      tunaV2SpendValidator: { validatorAddress: spendAddress, validatorHash: spendHash },
    }: GenesisV2 = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const lordTunaUtxo = await lucid.utxosAtWithUnit(
      spendAddress,
      tunav2ValidatorHash + fromText('TUNA') + spendHash,
    );

    const {
      tunaV3SpendValidator: { validatorHash: tunaV3SpendHash },
    }: GenesisV3 = JSON.parse(
      fs.readFileSync(`governance/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const tunaV2RealAddress = lucid.utils.validatorToAddress({
      script: tunav2Validator,
      type: 'PlutusV2',
    });

    const readUtxos = await lucid.utxosAt(forkValidatorAddress);

    const voteStateUtxo = (await lucid.utxosAt(tunaV2RealAddress)).filter((x) => {
      return x.assets[tunav2ValidatorHash + fromText('NOMA') + tunaV3SpendHash] === 1n;
    })[0];

    const lordTunaDatum = Data.from(lordTunaUtxo[0].datum!) as Constr<bigint>;

    const blockNumber = lordTunaDatum.fields[0];

    const spendRedeemer = new Constr(1, [new Constr(3, [blockNumber])]);

    const realTimeNow = Number((Date.now() / 1000).toFixed(0)) * 1000 - 60000;

    try {
      const setupTx = await lucid
        .newTx()
        .collectFrom([voteStateUtxo], Data.to(spendRedeemer))
        .readFrom(readUtxos)
        .readFrom(lordTunaUtxo)
        .payToContract(
          tunaV2RealAddress,
          {
            inline: Data.to(new Constr(1, [tunaV3SpendHash, 0n, (blockNumber as bigint) + 30n])),
          },
          {
            [tunav2ValidatorHash + fromText('NOMA') + tunaV3SpendHash]: 1n,
          },
        )
        .validFrom(realTimeNow)
        .complete();

      console.log('here');

      const setupTxSigned = await setupTx.sign().complete();

      await setupTxSigned.submit();

      console.log(setupTxSigned.toHash());

      await lucid.awaitTx(setupTxSigned.toHash());
    } catch (e) {
      console.log(e);
    }
  });

app
  .command('activateNomination')
  .description('Transition Nomination to being the active spend contract')
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .action(async ({ preview, blockfrostKey }) => {
    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0/', blockfrostKey);

    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');

    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));
    const {
      tunaV2MintValidator: { validatorHash: tunav2ValidatorHash, validator: tunav2Validator },
      forkValidator: { validatorAddress: forkValidatorAddress },
      tunaV2SpendValidator: { validatorAddress: spendAddress, validatorHash: spendHash },
    }: GenesisV2 = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );
    const lordTunaUtxo = (
      await lucid.utxosAtWithUnit(spendAddress, tunav2ValidatorHash + fromText('TUNA') + spendHash)
    )[0];

    const lordTunaUtxoRef = new Constr(0, [
      new Constr(0, [lordTunaUtxo.txHash]),
      BigInt(lordTunaUtxo.outputIndex),
    ]);

    const {
      tunaV3SpendValidator: {
        validatorHash: tunaV3SpendHash,
        validatorAddress: tunaV3SpendAddress,
      },
    }: GenesisV3 = JSON.parse(
      fs.readFileSync(`governance/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );
    const tunaV2RealAddress = lucid.utils.validatorToAddress({
      script: tunav2Validator,
      type: 'PlutusV2',
    });
    const readUtxos = await lucid.utxosAt(forkValidatorAddress);

    const voteStateUtxo = (await lucid.utxosAt(tunaV2RealAddress)).filter((x) => {
      return x.assets[tunav2ValidatorHash + fromText('NOMA') + tunaV3SpendHash] === 1n;
    })[0];

    const voteStateUtxoRef = new Constr(0, [
      new Constr(0, [voteStateUtxo.txHash]),
      BigInt(voteStateUtxo.outputIndex),
    ]);

    const lordTunaDatum = Data.from(lordTunaUtxo.datum!) as Constr<bigint>;

    console.log(lordTunaDatum);
    const blockNumber = lordTunaDatum.fields[0];

    const blockNumberHex =
      blockNumber.toString(16).length % 2 === 0
        ? blockNumber.toString(16)
        : `0${blockNumber.toString(16)}`;

    const spendRedeemer = new Constr(1, [new Constr(3, [blockNumber])]);
    const mintRedeemer = new Constr(6, [voteStateUtxoRef, lordTunaUtxoRef, 0n, blockNumber]);
    const updateRedeemer = new Constr(1, []);

    try {
      const setupTx = await lucid
        .newTx()
        .readFrom(readUtxos)
        .collectFrom([voteStateUtxo], Data.to(spendRedeemer))
        .collectFrom([lordTunaUtxo], Data.to(updateRedeemer))
        .mintAssets(
          {
            [tunav2ValidatorHash + fromText('NOMA') + tunaV3SpendHash]: -1n,
            [tunav2ValidatorHash + fromText('TUNA') + spendHash]: -1n,
            [tunav2ValidatorHash + fromText('TUNA') + tunaV3SpendHash]: 1n,
          },
          Data.to(mintRedeemer),
        )
        .payToContract(
          tunaV3SpendAddress,
          {
            inline: lordTunaUtxo.datum!,
          },
          {
            [tunav2ValidatorHash + fromText('TUNA') + tunaV3SpendHash]: 1n,
            [tunav2ValidatorHash + fromText('COUNTER') + blockNumberHex]: 1n,
          },
        )
        .complete({ nativeUplc: false });

      console.log('here');

      const setupTxSigned = await setupTx.sign().complete();

      console.log('here2');
      console.log(setupTxSigned.toHash());
      console.log(setupTxSigned.toString());
      console.log(await setupTxSigned.submit());
      console.log('here3');

      await lucid.awaitTx(setupTxSigned.toHash());
      console.log(setupTxSigned.toHash());
    } catch (e) {
      console.log(e);
    }
  });

app
  .command('clearWallet')
  .description('Cancel a nomination that did not pass the vote')
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .action(async ({ preview, blockfrostKey }) => {
    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0/', blockfrostKey);

    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');

    const a: Genesis = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'preview' : 'mainnet'}.json`, {
        encoding: 'utf8',
      }),
    );

    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    const allUtxos = await lucid.wallet.getUtxos();

    const nonAdaValue = {};

    allUtxos.forEach((utxo) => {
      Object.entries(utxo.assets).forEach((asset) => {
        const [name, amount] = asset;

        if (name !== 'lovelace' && name !== a.validatorHash + fromText('TUNA')) {
          nonAdaValue[name] = !!nonAdaValue[name] ? nonAdaValue[name] + amount : amount;
        }
      });
    });

    try {
      const setupTx = await lucid
        .newTx()
        .payToAddress(
          'addr_test1vppht3ffmu4rerk4r50h6447stfhkm86ttc64ghza7wx8mg225lw4',
          nonAdaValue,
        )
        .complete();

      console.log('here');

      const setupTxSigned = await setupTx.sign().complete();

      await setupTxSigned.submit();

      await lucid.awaitTx(setupTxSigned.toHash());

      console.log(setupTxSigned.toHash());
    } catch (e) {
      console.log(e);
    }
  });

app
  .command('mineWithNominatedContract')
  .description('Start the miner and allows vote for nominated contract')
  .addOption(blockFrostOption)
  .addOption(previewOption)
  .action(async ({ preview, blockfrostKey }) => {
    const alwaysLoop = true;

    // Construct a new trie with on-disk storage under the file path 'db'.
    let trie: Trie = await Trie.load(new Store(preview ? 'dbPreview' : 'db'));

    const {
      tunaV2MintValidator: {
        validatorHash: tunav2ValidatorHash,
        validatorAddress: tunaV2MintAddress,
      },
      tunaV2SpendValidator: {
        validatorHash: tunav2SpendValidatorHash,
        validatorAddress: tunaV2ValidatorAddress,
      },
      forkValidator: { validatorAddress: forkValidatorAddress },
    }: GenesisV2 = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const {
      tunaV3SpendValidator: { validatorHash: tunaV3Hash },
    }: GenesisV3 = JSON.parse(
      fs.readFileSync(`governance/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const provider = new Blockfrost('https://cardano-preprod.blockfrost.io/api/v0/', blockfrostKey);

    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preprod' : 'Mainnet');
    lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf8' }));

    const userPkh = lucid.utils.getAddressDetails(await lucid.wallet.address()).paymentCredential!;

    const minerCredential = new Constr(0, [userPkh.hash, fromText('AlL HaIl tUnA')]);

    console.log(Data.to(minerCredential));

    const minerCredHash = blake256(fromHex(Data.to(minerCredential)));

    console.log('here');

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

          trie = await trie.insert(Buffer.from(blake256(targetHash)), Buffer.from(targetHash));
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

        const { leadingZeros, difficultyNumber } = difficulty;

        if (
          leadingZeros > (state.fields[2] as bigint) ||
          (leadingZeros == (state.fields[2] as bigint) &&
            difficultyNumber < (state.fields[3] as bigint))
        ) {
          console.log(toHex(targetHash));
          console.log(toHex(targetState));
          // Found a valid nonce so break out of the loop
          nonce = targetState.slice(4, 20);
          break;
        }

        incrementNonceV2(targetState);

        targetHash = await sha256(await sha256(targetState));
      }

      const realTimeNow = Number((Date.now() / 1000).toFixed(0)) * 1000 - 60000;

      trie = await trie.insert(Buffer.from(blake256(targetHash)), Buffer.from(targetHash));

      const newMerkleRoot = trie.hash;

      let epochTime =
        (state.fields[4] as bigint) + BigInt(90000 + realTimeNow) - (state.fields[5] as bigint);

      let difficultyNumber = state.fields[3] as bigint;
      let leadingZeros = state.fields[2] as bigint;

      if ((state.fields[0] as bigint) % epochNumber === 0n && (state.fields[0] as bigint) > 0) {
        const adjustment = getDifficultyAdjustement(epochTime, twoWeeks);

        epochTime = 0n;

        const newDifficulty = calculateDifficultyNumber(
          {
            leadingZeros: state.fields[2] as bigint,
            difficultyNumber: state.fields[3] as bigint,
          },
          adjustment.numerator,
          adjustment.denominator,
        );

        difficultyNumber = newDifficulty.difficultyNumber;
        leadingZeros = newDifficulty.leadingZeros;
      }

      const postDatum = new Constr(0, [
        (state.fields[0] as bigint) + 1n,
        toHex(targetHash),
        leadingZeros,
        difficultyNumber,
        epochTime,
        BigInt(90000 + realTimeNow),
        toHex(newMerkleRoot),
      ]);

      const outDat = Data.to(postDatum);

      console.log(`Found next datum: ${outDat}`);

      const blockNumberHex =
        (state.fields[0] as bigint).toString(16).length % 2 === 0
          ? (state.fields[0] as bigint).toString(16)
          : `0${(state.fields[0] as bigint).toString(16)}`;

      const blockNumberHexNext =
        ((state.fields[0] as bigint) + 1n).toString(16).length % 2 === 0
          ? ((state.fields[0] as bigint) + 1n).toString(16)
          : `0${((state.fields[0] as bigint) + 1n).toString(16)}`;

      const mintTokens = {
        [tunav2ValidatorHash + fromText('TUNA')]:
          5000000000n / 2n ** ((state.fields[0] as bigint) / 210000n),
        [tunav2ValidatorHash + fromText('COUNTER') + blockNumberHexNext]: 1n,
        [tunav2ValidatorHash + fromText('COUNTER') + blockNumberHex]: -1n,
      };

      const masterTokens = {
        [tunav2ValidatorHash + fromText('TUNA') + tunav2SpendValidatorHash]: 1n,
        [tunav2ValidatorHash + fromText('COUNTER') + blockNumberHexNext]: 1n,
      };

      try {
        const readUtxos = await lucid.utxosAt(forkValidatorAddress);

        const merkleProof = Data.from(
          (await trie.prove(Buffer.from(blake256(targetHash)))).toCBOR().toString('hex'),
        );

        const minerRedeemer = Data.to(new Constr(0, [toHex(nonce), minerCredential, merkleProof]));

        const spendGovRedeemer = new Constr(1, [
          new Constr(2, [1n, (state.fields[0] as bigint) + 1n]),
        ]);

        const mintRedeemer = Data.to(
          new Constr(1, [
            new Constr(0, [new Constr(0, [minerOutput.txHash]), BigInt(minerOutput.outputIndex)]),
            state.fields[0] as bigint,
          ]),
        );

        const mintUtxos = await lucid.utxosAt(tunaV2MintAddress);

        const mintUtxoDatum = Data.from(mintUtxos[0].datum!) as Constr<bigint | string>;

        const outputGovDatum = new Constr(1, [
          mintUtxoDatum.fields[0],
          (mintUtxoDatum.fields[1] as bigint) + 1n,
          mintUtxoDatum.fields[2],
        ]);

        const txMine = await lucid
          .newTx()
          .readFrom(readUtxos)
          .collectFrom([minerOutput], minerRedeemer)
          .collectFrom(mintUtxos, Data.to(spendGovRedeemer))
          .payToContract(tunaV2ValidatorAddress, { inline: outDat }, masterTokens)
          .payToContract(
            tunaV2MintAddress,
            { inline: Data.to(outputGovDatum) },
            { [tunav2ValidatorHash + fromText('NOMA') + tunaV3Hash]: 1n },
          )
          .mintAssets(mintTokens, mintRedeemer)
          .addSigner(await lucid.wallet.address())
          .validTo(realTimeNow + 180000)
          .validFrom(realTimeNow)
          .complete({ nativeUplc: false });

        const signed = await txMine.sign().complete();

        await signed.submit();

        console.log(`TX HASH: ${signed.toHash()}`);
        console.log('Waiting for confirmation...');

        await lucid.awaitTx(signed.toHash());
        await delay(25000);
      } catch (e) {
        console.log(e);
        await trie.delete(Buffer.from(blake256(targetHash)));
      }
    }
  });

app.parse();
