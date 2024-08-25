import { Argument, Command, Option } from '@commander-js/extra-typings';
import { CardanoSyncClient } from '@utxorpc/sdk';
import * as Cardano from '@utxorpc/spec/lib/utxorpc/v1alpha/cardano/cardano_pb.js';
import { BlockRef } from '@utxorpc/spec/lib/utxorpc/v1alpha/sync/sync_pb.js';
import crypto from 'crypto';
import 'dotenv/config';
import fs from 'fs';
import * as plutus from '../src/lib/plutus';
import { Constr, Data } from '@blaze-cardano/tx';
import {
  Address,
  AssetId,
  HexBlob,
  wordlist,
  mnemonicToEntropy,
  Bip32PrivateKey,
  PolicyId,
  AssetName,
  toHex,
  fromHex,
  Slot,
  Script,
  PlutusV2Script,
  SLOT_CONFIG_NETWORK,
  TransactionInput,
  addressFromValidator,
  NetworkId,
  sha2_256,
  RewardAddress,
  RewardAccount,
  TransactionOutput,
  CredentialType,
  Credential,
  Hash28ByteBase16,
} from '@blaze-cardano/core';
import { makeValue, Kupmios, Blaze, HotWallet, applyParamsToScript } from '@blaze-cardano/sdk';

import {
  blake256,
  calculateDifficultyNumber,
  getDifficulty,
  getDifficultyAdjustement,
  incrementNonceV2,
  readValidator,
  readValidators,
  readNewSpendValidator,
  sha256,
  calculateInterlink,
} from './utils';

import { Store, Trie } from '@aiken-lang/merkle-patricia-forestry';
import { Unwrapped } from '@blaze-cardano/ogmios';

// import { Blockfrost } from '@blaze-cardano/query';
import { Blockfrost } from './blockfrost';

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
const epochNumber = 50n;
const twoWeeks = 30_000_000n;
const halvingNumber = 210000n;

const app = new Command();

const fromText = (text: string) => Buffer.from(text, 'ascii').toString('hex');

app.name('fortuna').description('Fortuna miner').version('0.0.2');

const kupoUrlOption = new Option('-k, --kupo-url <string>', 'Kupo URL')
  .env('KUPO_URL')
  .makeOptionMandatory(true);

const ogmiosUrlOption = new Option('-o, --ogmios-url <string>', 'Ogmios URL')
  .env('OGMIOS_URL')
  .makeOptionMandatory(true);

const utxoRpcUriOption = new Option('-u, --utxo-rpc-uri <string>', 'Utxo RPC URI')
  .env('UTXO_RPC_URI')
  .makeOptionMandatory(true);

const utxoRpcApiKeyOption = new Option('-y, --utxo-rpc-api-key <string>', 'Utxo RPC API Key')
  .env('UTXO_RPC_API_KEY')
  .makeOptionMandatory(true);

const previewOption = new Option('-p, --preview', 'Use testnet').default(false);

const useV2History = new Option('-h, --useHistory', 'Use history of V2').default(false);

export interface InterlinkHash {
  hash: string;
}

const blazeInitOg = async (kupoUrl: string, ogmiosUrl: string) => {
  const provider = new Kupmios(kupoUrl, await Unwrapped.Ogmios.new(ogmiosUrl));
  const mnemonic = fs.readFileSync('seed.txt', { encoding: 'utf8' });
  const entropy = mnemonicToEntropy(mnemonic, wordlist);
  const masterkey = Bip32PrivateKey.fromBip39Entropy(Buffer.from(entropy), '');
  const wallet = await HotWallet.fromMasterkey(masterkey.hex(), provider);
  return Blaze.from(provider, wallet);
};

const blazeInit = async () => {
  const provider = new Blockfrost({
    network: 'cardano-mainnet',
    projectId: 'mainnetT0T8MR0BXsXI7oq0jrWEkEH3lmnGtdXz',
  });

  const mnemonic = fs.readFileSync('seed.txt', { encoding: 'utf8' });
  const entropy = mnemonicToEntropy(mnemonic, wordlist);
  const masterkey = Bip32PrivateKey.fromBip39Entropy(Buffer.from(entropy), '');
  const wallet = await HotWallet.fromMasterkey(masterkey.hex(), provider, NetworkId.Mainnet);
  return await Blaze.from(provider, wallet);
};

app
  .command('mineV1')
  .description('Start the miner')
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, kupoUrl, ogmiosUrl }) => {
    const trueValue = true;

    const blaze = await blazeInitOg(kupoUrl, ogmiosUrl);
    const ogmios = (await blazeInitOg(kupoUrl, ogmiosUrl)).provider.ogmios;
    while (trueValue) {
      const { validatorAddress, validator, validatorHash }: Genesis = JSON.parse(
        fs.readFileSync(`genesis/${preview ? 'preview' : 'mainnet'}.json`, {
          encoding: 'utf8',
        }),
      );

      console.log('Starting ...');
      let validatorUTXO = await blaze.provider.getUnspentOutputByNFT(
        AssetId.fromParts(PolicyId(validatorHash), AssetName(fromText('lord tuna'))),
      );

      let validatorState = validatorUTXO.output().datum()!;

      let state = Data.from(validatorState.asInlineData()!, plutus.Tunav1Spend.state);

      let nonce = new Uint8Array(16);

      crypto.getRandomValues(nonce);

      let targetState = fromHex(
        Data.to(
          {
            nonce: toHex(nonce),
            blockNumber: state.blockNumber,
            currentHash: state.currentHash,
            leadingZeros: state.leadingZeros,
            targetNumber: state.targetNumber,
            epochTime: state.epochTime,
          },
          plutus.Tunav1Dummy._state,
        ).toCbor(),
      );

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
          validatorUTXO = await blaze.provider.getUnspentOutputByNFT(
            AssetId.fromParts(PolicyId(validatorHash), AssetName(fromText('lord tuna'))),
          );
          validatorState = validatorUTXO.output().datum()!;

          if (state !== Data.from(validatorState.asInlineData()!, plutus.Tunav1Spend.state)) {
            state = Data.from(validatorState.asInlineData()!, plutus.Tunav1Spend.state);

            nonce = new Uint8Array(16);

            crypto.getRandomValues(nonce);

            targetState = fromHex(
              Data.to(
                {
                  nonce: toHex(nonce),
                  blockNumber: state.blockNumber,
                  currentHash: state.currentHash,
                  leadingZeros: state.leadingZeros,
                  targetNumber: state.targetNumber,
                  epochTime: state.epochTime,
                },
                plutus.Tunav1Dummy._state,
              ).toCbor(),
            );
          }
        }

        targetHash = await sha256(await sha256(targetState));
        difficulty = getDifficulty(targetHash);

        const { leadingZeros, difficultyNumber } = difficulty;

        if (
          leadingZeros > (state.leadingZeros as bigint) ||
          (leadingZeros == (state.leadingZeros as bigint) &&
            difficultyNumber < (state.targetNumber as bigint))
        ) {
          nonce = targetState.slice(4, 20);
          break;
        }

        incrementNonceV2(targetState);
      }

      console.log(toHex(targetState));

      const current_slot = (await ogmios.queryNetworkTip().then((point) => {
        if (point === 'origin') {
          return undefined;
        }

        return point.slot;
      }))!;

      const interlink = calculateInterlink(
        toHex(targetHash),
        difficulty,
        {
          leadingZeros: state.leadingZeros,
          difficultyNumber: state.targetNumber,
        },
        state.interlink.map((x) => Data.from(x)),
      ).map((x) => Data.to(x));

      const networkSlotConfig = SLOT_CONFIG_NETWORK.Preview;

      const currentPosixTime = BigInt(
        (current_slot + 45 - networkSlotConfig.zeroSlot) * networkSlotConfig.slotLength +
          networkSlotConfig.zeroTime,
      );

      let epochTime = state.epochTime + currentPosixTime - state.currentPosixTime;

      let difficulty_number = state.targetNumber as bigint;
      let leadingZeros = state.leadingZeros as bigint;

      if (state.blockNumber % epochNumber === 0n && state.blockNumber > 0) {
        const adjustment = getDifficultyAdjustement(epochTime, twoWeeks);

        epochTime = 0n;

        const new_difficulty = calculateDifficultyNumber(
          {
            leadingZeros: state.leadingZeros,
            difficultyNumber: state.targetNumber,
          },
          adjustment.numerator,
          adjustment.denominator,
        );

        difficulty_number = new_difficulty.difficultyNumber;
        leadingZeros = new_difficulty.leadingZeros;
      }
      console.log('here2');

      const postDatum = Data.to(
        {
          blockNumber: state.blockNumber + 1n,
          currentHash: toHex(targetHash),
          leadingZeros,
          targetNumber: difficulty_number,
          epochTime,
          currentPosixTime,
          extra: Data.to(fromText('AlL HaIl tUnA')),
          interlink,
        },
        plutus.Tunav1Spend.state,
      );

      console.log(`Found next datum: ${postDatum.toCbor()}`);

      const masterToken: [string, bigint] = [validatorHash + fromText('lord tuna'), 1n];

      console.log('Mine', Data.to('Mine', plutus.Tunav1Mint.state).toCbor());
      console.log('Nonce', Data.to({ wrapper: toHex(nonce) }, plutus.Tunav1Spend.nonce).toCbor());

      try {
        const txMine = await blaze
          .newTransaction()
          .provideScript(Script.fromCbor(HexBlob(validator)))
          .addInput(validatorUTXO, Data.to({ wrapper: toHex(nonce) }, plutus.Tunav1Spend.nonce))
          .lockAssets(Address.fromBech32(validatorAddress), makeValue(0n, masterToken), postDatum)
          .addMint(
            PolicyId(validatorHash),
            new Map([
              [
                AssetName(fromText('TUNA')),
                5000000000n / 2n ** (state.blockNumber / halvingNumber),
              ],
            ]),
            Data.to('Mine', plutus.Tunav1Mint.state),
          )
          .setValidFrom(Slot(current_slot))
          .setValidUntil(Slot(current_slot + 90))
          .complete();

        const signed = await blaze.signTransaction(txMine);

        await blaze.submitTransaction(signed);

        console.log(`TX HASH: ${signed.getId()}`);
        console.log('Waiting for confirmation...');

        console.log(
          'awaitConfirmation',
          await blaze.provider.awaitTransactionConfirmation(signed.getId(), 30000),
        );
      } catch (e) {
        console.log(e);
      }
    }
  });

app
  .command('mine')
  .description('Start the miner')
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, kupoUrl, ogmiosUrl }) => {
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

    const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preview' : 'Mainnet');
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
        await delay(3000);
      } catch (e) {
        console.log(e);
        await trie.delete(Buffer.from(blake256(targetHash)));
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
    const blaze = await blazeInitOg(kupoUrl, ogmiosUrl);
    const ogmios = (await blazeInitOg(kupoUrl, ogmiosUrl)).provider.ogmios;

    const utxo = (await blaze.wallet.getUnspentOutputs())[0];

    const initOutputRef = utxo.input();
    const inputAsData = new Constr(0, [
      new Constr(0, [initOutputRef.transactionId().toString()]),
      initOutputRef.index(),
    ]);

    const appliedValidator = new plutus.Tunav1Spend({
      transactionId: { hash: initOutputRef.transactionId().toString() },
      outputIndex: initOutputRef.index(),
    });

    const bootstrapHash = toHex(await sha256(await sha256(fromHex(Data.to(inputAsData).toCbor()))));

    const validatorAddress = addressFromValidator(NetworkId.Testnet, appliedValidator);

    const validatorHash = appliedValidator.hash();

    const masterToken: [string, bigint] = [validatorHash + fromText('lord tuna'), 1n];

    const lastSlot = (await ogmios.queryNetworkTip().then((point) => {
      if (point === 'origin') {
        return undefined;
      }

      return point.slot;
    }))!;

    const slotToTime =
      (lastSlot - SLOT_CONFIG_NETWORK.Preview.zeroSlot) * SLOT_CONFIG_NETWORK.Preview.slotLength +
      SLOT_CONFIG_NETWORK.Preview.zeroTime;

    // State
    //
    const datum = Data.to(
      {
        blockNumber: 0n,
        currentHash: bootstrapHash,
        leadingZeros: 5n,
        targetNumber: 65535n,
        epochTime: 0n,
        currentPosixTime: BigInt(slotToTime + 45000),
        extra: Data.to(0n),
        interlink: [],
      },
      plutus.Tunav1Spend.state,
    );

    const tx = await blaze
      .newTransaction()
      .addInput(utxo)
      .lockAssets(validatorAddress, makeValue(0n, masterToken), datum)
      .addMint(
        PolicyId(validatorHash),
        new Map([[AssetName(fromText('lord tuna')), 1n]]),
        Data.to('Genesis', plutus.Tunav1Mint.state),
      )

      .provideScript(appliedValidator)
      .setValidFrom(Slot(lastSlot))
      .setValidUntil(Slot(lastSlot + 90))
      .complete();

    const signed = await blaze.signTransaction(tx);

    try {
      await blaze.submitTransaction(signed);

      console.log(`TX Hash: ${signed.getId()}`);

      await blaze.provider.awaitTransactionConfirmation(signed.getId(), 30000);

      console.log(`Completed and saving genesis file.`);

      console.log('out_ref', Data.to(inputAsData).toCbor());

      fs.writeFileSync(
        `genesis/${preview ? 'preview' : 'mainnet'}.json`,
        JSON.stringify({
          validator: appliedValidator.toCbor(),
          validatorHash,
          validatorAddress: validatorAddress.toBech32(),
          bootstrapHash,
          datum: datum.toCbor(),
          outRef: Data.to(inputAsData).toCbor(),
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
    const fortunaV1: Genesis = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'preview' : 'mainnet'}.json`, {
        encoding: 'utf8',
      }),
    );

    const networkId = preview ? NetworkId.Testnet : NetworkId.Mainnet;

    const merkleRoot = fs.readFileSync(preview ? 'currentPreviewRoot.txt' : 'currentRoot.txt', {
      encoding: 'utf-8',
    });

    const blaze = await blazeInit();

    const utxo = (await blaze.wallet.getUnspentOutputs()).sort((a, b) => {
      return (
        a.input().transactionId().localeCompare(b.input().transactionId()) ||
        a.input().index().toString().localeCompare(b.input().index().toString())
      );
    })[0];

    const utxo2 = (await blaze.wallet.getUnspentOutputs()).sort((a, b) => {
      return (
        a.input().transactionId().localeCompare(b.input().transactionId()) ||
        a.input().index().toString().localeCompare(b.input().index().toString())
      );
    })[1];

    const fortunaV1Hash = fortunaV1.validatorHash;

    const forkValidatorApplied = new plutus.SimplerforkNftFork(
      { transactionId: { hash: utxo.input().transactionId() }, outputIndex: utxo.input().index() },
      fortunaV1Hash,
    );

    const forkValidatorHash = forkValidatorApplied.hash();

    console.log(forkValidatorHash);

    const forkValidatorAddress = addressFromValidator(networkId, forkValidatorApplied);

    // const readUtxos = await blaze.provider.getUnspentOutputs(forkValidatorAddress);

    // readUtxos.forEach((x) => {
    //   console.log('READ INPUT', x.toCbor(), '\n');
    // });

    const tunaV2MintApplied = new plutus.Tunav2Tuna(
      Data.to(fortunaV1Hash),
      Data.to(forkValidatorHash),
    );

    const tunaV2MintHash = tunaV2MintApplied.hash();

    const tunaV2MintAddress = addressFromValidator(networkId, tunaV2MintApplied);

    console.log(tunaV2MintHash);

    const tunaV2SpendApplied = new plutus.Tunav2Mine(tunaV2MintHash);

    const tunaV2SpendHash = tunaV2SpendApplied.hash();

    console.log(tunaV2SpendHash);

    const fortunaV2Address = addressFromValidator(networkId, tunaV2SpendApplied);

    const lastestV1Block = await blaze.provider.getUnspentOutputByNFT(
      AssetId(fortunaV1Hash + fromText('lord tuna')),
    );

    const lastestV1BlockData = Data.from(
      lastestV1Block.output().datum()!.asInlineData()!,
      plutus.Tunav1Spend.state,
    );

    const { blockNumber, currentHash, leadingZeros, targetNumber, currentPosixTime, epochTime } =
      lastestV1BlockData;

    const blockNumberHex =
      blockNumber.toString(16).length % 2 === 0
        ? blockNumber.toString(16)
        : `0${blockNumber.toString(16)}`;

    console.log(blockNumberHex);

    const lockState = Data.to(
      { blockHeight: blockNumber, currentLockedTuna: 0n },
      plutus.SimplerforkFork._datum,
    );

    const forkRedeemer = Data.to(
      { HardFork: { lockOutputIndex: 0n } },
      plutus.SimplerforkNftFork.redeemer,
    );

    const forkMintRedeemer = Data.to(0n);

    const fortunaState = Data.to(
      {
        blockNumber,
        currentHash,
        leadingZeros: leadingZeros - 2n,
        targetNumber,
        currentPosixTime,
        epochTime,
        merkleRoot,
      },
      plutus.Tunav2Mine.datum,
    );

    console.log(
      'State',
      blockNumber,
      currentHash,
      (leadingZeros as bigint) - 2n,
      targetNumber,
      epochTime,
      currentPosixTime,
      merkleRoot,
    );

    const fortunaRedeemer = Data.to('Genesis', plutus.Tunav2Tuna.redeemer);

    try {
      // const registerTx = await blaze
      //   .newTransaction()
      //   .addInput(utxo2)
      //   .addRegisterStake(
      //     Credential.fromCore({ hash: forkValidatorHash, type: CredentialType.ScriptHash }),
      //   )
      //   .complete();

      // const registerSigned = await blaze.signTransaction(registerTx);

      // const registerHash = await blaze.submitTransaction(registerSigned);

      // console.log('Register Tx', registerHash);

      // await blaze.provider.awaitTransactionConfirmation(registerHash);

      // await delay(30000);

      const tx = await blaze
        .newTransaction()
        .addReferenceInput(lastestV1Block)
        .addInput(utxo)
        .lockAssets(
          forkValidatorAddress,
          makeValue(0n, [forkValidatorHash + fromText('lock_state'), 1n]),
          lockState,
        )
        .lockAssets(
          fortunaV2Address,
          makeValue(
            0n,
            [tunaV2MintHash + fromText('TUNA') + tunaV2SpendHash, 1n],
            [tunaV2MintHash + fromText('COUNTER') + blockNumberHex, 1n],
          ),
          fortunaState,
        )
        .addMint(
          PolicyId(tunaV2MintHash),
          new Map([
            [AssetName(fromText('TUNA') + tunaV2SpendHash), 1n],
            [AssetName(fromText('COUNTER') + blockNumberHex), 1n],
          ]),
          fortunaRedeemer,
        )
        .addMint(
          PolicyId(forkValidatorHash),
          new Map([[AssetName(fromText('lock_state')), 1n]]),
          forkMintRedeemer,
        )
        .addWithdrawal(
          RewardAccount.fromCredential(
            { hash: forkValidatorHash, type: CredentialType.ScriptHash },
            networkId,
          ),
          0n,
          forkRedeemer,
        )
        .provideScript(tunaV2MintApplied)
        .provideScript(tunaV2SpendApplied)
        .provideScript(forkValidatorApplied)
        .complete();

      const signed = await blaze.signTransaction(tx);

      const txHash = await blaze.submitTransaction(signed);

      console.log(`TX Hash: ${txHash}`);

      await blaze.provider.awaitTransactionConfirmation(txHash);

      console.log(`Completed and saving genesis file.`);

      fs.writeFileSync(
        `genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`,
        JSON.stringify({
          forkValidator: {
            validator: forkValidatorApplied.toCbor(),
            validatorHash: forkValidatorHash,
            validatorAddress: forkValidatorAddress.toBech32(),
            datum: lockState.toCbor(),
            outRef: { txHash: utxo.input().transactionId(), index: utxo.input().index },
          },
          tunaV2MintValidator: {
            validator: tunaV2MintApplied.toCbor(),
            validatorHash: tunaV2MintHash,
            validatorAddress: tunaV2MintAddress.toBech32(),
          },
          tunaV2SpendValidator: {
            validator: tunaV2SpendApplied.toCbor(),
            validatorHash: tunaV2SpendHash,
            validatorAddress: fortunaV2Address.toBech32(),
            datum: fortunaState.toCbor(),
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
  .addOption(previewOption)
  .addArgument(
    new Argument('<amount>', 'Amount of V1 Tuna to lock').argParser((val) => BigInt(val)),
  )
  .action(async (amount, { preview }) => {
    const fortunaV1: Genesis = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'preview' : 'mainnet'}.json`, {
        encoding: 'utf8',
      }),
    );

    const {
      tunaV2MintValidator: { validatorHash: tunav2ValidatorHash, validator: tunaValidator },
      forkValidator: {
        validatorAddress: forkValidatorAddress,
        validatorHash: forkValidatorHash,
        validator: forkValidator,
      },
    }: GenesisV2 = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const blaze = await blazeInit();

    try {
      // Does this work and actually mutate readUtxos?
      const lockUtxo = await blaze.provider.getUnspentOutputByNFT(
        AssetId(forkValidatorHash + fromText('lock_state')),
      );

      const prevState = Data.from(
        lockUtxo.output().datum()!.asInlineData()!,
        plutus.SimplerforkFork._datum,
      );

      const lockRedeemer = Data.to(
        { Lock: { lockOutputIndex: 0n, lockingAmount: amount } },
        plutus.SimplerforkNftFork.redeemer,
      );

      const tunaRedeemer = Data.to('Redeem', plutus.Tunav2Tuna.redeemer);

      const newLockState = Data.to(
        {
          blockHeight: prevState.blockHeight,
          currentLockedTuna: prevState.currentLockedTuna + amount,
        },
        plutus.SimplerforkFork._datum,
      );

      const spendRedeemer = Data.to({ wrapper: Data.to(0n) }, plutus.SimplerforkFork._redeemer);

      const tx = await blaze
        .newTransaction()
        .provideScript(Script.fromCbor(HexBlob(forkValidator)))
        .provideScript(Script.fromCbor(HexBlob(tunaValidator)))
        .addInput(lockUtxo, spendRedeemer)
        .lockAssets(
          Address.fromBech32(forkValidatorAddress),
          makeValue(
            0n,
            [forkValidatorHash + fromText('lock_state'), 1n],
            [fortunaV1.validatorHash + fromText('TUNA'), prevState.currentLockedTuna + amount],
          ),
          newLockState,
        )
        .addMint(
          PolicyId(tunav2ValidatorHash),
          new Map([[AssetName(fromText('TUNA')), amount]]),
          tunaRedeemer,
        )
        .addWithdrawal(
          RewardAccount.fromCredential(
            { hash: Hash28ByteBase16(forkValidatorHash), type: CredentialType.ScriptHash },
            NetworkId.Testnet,
          ),
          0n,
          lockRedeemer,
        )
        .complete();

      const signed = await blaze.signTransaction(tx);

      const hash = await blaze.submitTransaction(signed);

      console.log(`TX HASH: ${hash}`);
      console.log('Waiting for confirmation...');

      await blaze.provider.awaitTransactionConfirmation(hash);
    } catch (e) {
      console.log(e);
    }
  });

app
  .command('setup')
  .description('Create script refs')
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, ogmiosUrl, kupoUrl }) => {
    const {
      forkValidator: { validator: forkScript },
      tunaV2MintValidator: { validator: mintScript },
      tunaV2SpendValidator: { validator: spendScript },
    }: GenesisV2 = JSON.parse(
      fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
        encoding: 'utf8',
      }),
    );

    const blaze = await blazeInit();

    const output1 = new TransactionOutput(
      Address.fromBech32(
        'addr1qytemxekk4mtad3jta9kwdu5ymgpzrn54250s79zqqeslpcdj23fymx8ledsa2nakuqzd6tad5le4x8yuefzfrsumv2sn0ada5',
      ),
      makeValue(0n),
    );
    output1.setScriptRef(Script.fromCbor(HexBlob(forkScript)));

    const output2 = new TransactionOutput(
      Address.fromBech32(
        'addr1qytemxekk4mtad3jta9kwdu5ymgpzrn54250s79zqqeslpcdj23fymx8ledsa2nakuqzd6tad5le4x8yuefzfrsumv2sn0ada5',
      ),
      makeValue(0n),
    );
    output2.setScriptRef(Script.fromCbor(HexBlob(mintScript)));

    const output3 = new TransactionOutput(
      Address.fromBech32(
        'addr1qytemxekk4mtad3jta9kwdu5ymgpzrn54250s79zqqeslpcdj23fymx8ledsa2nakuqzd6tad5le4x8yuefzfrsumv2sn0ada5',
      ),
      makeValue(0n),
    );
    output3.setScriptRef(Script.fromCbor(HexBlob(spendScript)));

    try {
      const tx = await blaze.newTransaction().addOutput(output1).complete();

      const signed = await blaze.signTransaction(tx);

      const txHash = await blaze.submitTransaction(signed);

      console.log(`TX Hash: ${txHash}`);

      await blaze.provider.awaitTransactionConfirmation(txHash, 40000);

      await delay(40000);

      const tx2 = await blaze.newTransaction().addOutput(output2).addOutput(output3).complete();

      const signed2 = await blaze.signTransaction(tx2);

      const txHash2 = await blaze.submitTransaction(signed2);

      console.log(`TX Hash: ${txHash2}`);

      await blaze.provider.awaitTransactionConfirmation(txHash2, 25000);
      console.log('done');
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

    // const {
    //   tunaV2MintValidator: { validatorHash: tunav2ValidatorHash },
    //   tunaV2SpendValidator: { validatorHash: tunav2SpendValidatorHash },
    // }: GenesisV2 = JSON.parse(
    //   fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
    //     encoding: 'utf8',
    //   }),
    // );

    const client = new CardanoSyncClient({
      uri: utxoRpcUri,
      headers: {
        'dmtr-api-key': utxoRpcApiKey,
      },
    });

    let nextToken: BlockRef | undefined = new BlockRef({
      index: 55194964n,
      hash: fromHex('125ff4eb8168a03e34ed003975ed95b8844b1e751274fd5ce1b5abd8ca5b9908'),
    });

    const headerHashes = JSON.parse(
      fs.readFileSync(preview ? 'V1PreviewHistory.json' : 'V1History.json', 'utf8'),
    );

    for (const header of headerHashes) {
      console.log(header.current_hash);
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
                const datum = output.datum!.plutusData.value! as Cardano.Constr;

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
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, ogmiosUrl, kupoUrl }) => {
    const blaze = await blazeInit();

    const address = blaze.wallet.address;

    const utxos = await blaze.wallet.getUnspentOutputs();

    const balance = utxos.reduce((acc, u) => {
      return acc + u.output().amount().coin();
    }, 0n);

    console.log(`Address: ${address.toBech32()}`);
    console.log(`ADA Balance: ${balance / 1_000_000n}`);

    try {
      const genesisFile = fs.readFileSync(`genesis/${preview ? 'preview' : 'mainnet'}.json`, {
        encoding: 'utf8',
      });

      // const genesisFileV2 = fs.readFileSync(`genesis/${preview ? 'previewV2' : 'mainnetV2'}.json`, {
      //   encoding: 'utf8',
      // });

      const { validatorHash }: Genesis = JSON.parse(genesisFile);
      // const {
      //   tunaV2MintValidator: { validatorHash: validatorHashV2 },
      // }: GenesisV2 = JSON.parse(genesisFileV2);

      const tunaBalance = utxos.reduce((acc, u) => {
        return (
          acc +
          (u.output().amount().multiasset()
            ? (u
                .output()
                .amount()
                .multiasset()!
                .get(AssetId(validatorHash + fromText('TUNA'))) ?? 0n)
            : 0n)
        );
      }, 0n);

      // const tunaV2Balance = utxos.reduce((acc, u) => {
      //   return (
      //     acc +
      //     (u.output().amount().multiasset()
      //       ? (u
      //           .output()
      //           .amount()
      //           .multiasset()!
      //           .get(AssetId(validatorHashV2 + fromText('TUNA'))) ?? 0n)
      //       : 0n)
      //   );
      // }, 0n);

      console.log(`TUNA Balance: ${Number(tunaBalance) / 100_000_000}`);
      // console.log(`TUNAV2 Balance: ${Number(tunaV2Balance) / 100_000_000}`);
    } catch {
      console.log(`TUNA Balance: 0`);
    }

    process.exit(0);
  });

app
  .command('nominate')
  .description('Nominate a new Fortuna Spending Contract')
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, kupoUrl, ogmiosUrl }) => {
    const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preview' : 'Mainnet');

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

    const newSpendScript: Cardano.Script = { script: newSpendApplied, type: 'PlutusV2' };

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
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, kupoUrl, ogmiosUrl }) => {
    const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preview' : 'Mainnet');

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

    const voteStateUtxo = (await lucid.utxosAt(tunaV2RealAddress))[0];

    const mintVoteForRedeemer = new Constr(4, [
      new Constr(0, [new Constr(0, [voteStateUtxo.txHash]), BigInt(voteStateUtxo.outputIndex)]),
    ]);

    try {
      const setupTx = await lucid
        .newTx()
        .readFrom([voteStateUtxo])
        .readFrom(readUtxos)
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
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, kupoUrl, ogmiosUrl }) => {
    const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preview' : 'Mainnet');

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

    const voteStateUtxo = (await lucid.utxosAt(tunaV2RealAddress))[0];

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
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, kupoUrl, ogmiosUrl }) => {
    const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preview' : 'Mainnet');

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

    const voteStateUtxo = (await lucid.utxosAt(tunaV2RealAddress))[0];

    const [script_hash, for_count, anti_script_hash, against_count, deadline] = (
      Data.from(voteStateUtxo.datum!) as Constr<string | bigint>
    ).fields;

    const voteSpendRedeemer = new Constr(1, [new Constr(0, [])]);

    console.log('HERE222');
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

    console.log('HERE333');

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
      console.log('here1');

      const setupTxSigned = await setupTx.sign().complete();

      await setupTxSigned.submit();

      console.log(setupTxSigned.toHash());

      await lucid.awaitTx(setupTxSigned.toHash());

      const realTimeNow = Number((Date.now() / 1000).toFixed(0)) * 1000;

      console.log('HERE444');

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
        .validTo(realTimeNow + 60000)
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
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, kupoUrl, ogmiosUrl }) => {
    const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preview' : 'Mainnet');

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

    const voteStateUtxo = (await lucid.utxosAt(tunaV2RealAddress))[0];

    const [script_hash, for_count, anti_script_hash, against_count, deadline] = (
      Data.from(voteStateUtxo.datum!) as Constr<string | bigint>
    ).fields;

    const voteSpendRedeemer = new Constr(1, [new Constr(0, [])]);
    const voteSpendRedeemer2 = new Constr(1, [new Constr(1, [])]);

    console.log('HERE222');
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

    console.log('HERE333');

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
        .complete();
      console.log('here1');

      const setupTxSigned = await setupTx.sign().complete();

      await setupTxSigned.submit();

      console.log(setupTxSigned.toHash());

      await lucid.awaitTx(setupTxSigned.toHash());

      const realTimeNow = Number((Date.now() / 1000).toFixed(0)) * 1000;

      console.log('HERE444');

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
        .validTo(realTimeNow + 60000)
        .complete();

      console.log('here');

      const txSigned = await tx.sign().complete();

      await txSigned.submit();

      console.log(txSigned.toHash());
      await lucid.awaitTx(txSigned.toHash());

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
        .collectFrom([voteStateUtxo], Data.to(voteSpendRedeemer2))
        .payToContract(
          tunaV2RealAddress,
          { inline: Data.to(voteStateOutputDatum2) },
          { [tunav2ValidatorHash + fromText('NOMA') + tunaV3SpendHash]: 1n },
        )
        .validTo(realTimeNow + 60000)
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
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, kupoUrl, ogmiosUrl }) => {
    const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preview' : 'Mainnet');

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

    const voteStateUtxo = (await lucid.utxosAt(tunaV2RealAddress))[0];

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
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, kupoUrl, ogmiosUrl }) => {
    const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preview' : 'Mainnet');

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

    const voteStateUtxo = (await lucid.utxosAt(tunaV2RealAddress))[0];

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
            inline: Data.to(new Constr(1, [tunaV3SpendHash, 0n, (blockNumber as bigint) + 50n])),
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
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, kupoUrl, ogmiosUrl }) => {
    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    // const lucid = await Lucid.new(provider, preview ? 'Preview' : 'Mainnet');
    const provider = new Blockfrost(
      'https://cardano-preview.blockfrost.io/api/v0/',
      'previewty2mM5pfSKV4NnMQUhOZl6nzX37xP9Qb',
    );
    const lucid = await Lucid.new(provider, preview ? 'Preview' : 'Mainnet');

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

    const voteStateUtxo = (await lucid.utxosAt(tunaV2RealAddress))[0];

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
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, kupoUrl, ogmiosUrl }) => {
    const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preview' : 'Mainnet');

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
  .addOption(kupoUrlOption)
  .addOption(ogmiosUrlOption)
  .addOption(previewOption)
  .action(async ({ preview, kupoUrl, ogmiosUrl }) => {
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

    const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await Lucid.new(provider, preview ? 'Preview' : 'Mainnet');
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
          .readFrom(readUtxos)
          .validTo(realTimeNow + 180000)
          .validFrom(realTimeNow)
          .complete();

        const signed = await txMine.sign().complete();

        await signed.submit();

        console.log(`TX HASH: ${signed.toHash()}`);
        console.log('Waiting for confirmation...');

        await lucid.awaitTx(signed.toHash());
        await delay(3000);
      } catch (e) {
        console.log(e);
        await trie.delete(Buffer.from(blake256(targetHash)));
      }
    }
  });

app.parse();
