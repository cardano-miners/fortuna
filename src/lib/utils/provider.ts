import {
  ProtocolParameters,
  Address,
  TransactionUnspentOutput,
  AssetId,
  TransactionInput,
  DatumHash,
  PlutusData,
  TransactionId,
  Transaction,
  Redeemers,
  HexBlob,
  CostModels,
  PlutusLanguageVersion,
  TokenMap,
  TransactionOutput,
  Value,
  Datum,
  Script,
  PlutusV1Script,
  PlutusV2Script,
  Redeemer,
  RedeemerTag,
  ExUnits,
} from '@blaze-cardano/core';
import { Provider, Blaze, WebWallet, CIP30Interface } from '@blaze-cardano/sdk';

export class BrowserProvider implements Provider {
  private readonly baseUrl: string = '/api/provider';

  async getParameters(): Promise<ProtocolParameters> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      body: JSON.stringify({
        method: 'getParameters',
      }),
    });

    const response = await res.json<BlockfrostResponse<BlockfrostProtocolParametersResponse>>();

    if (!response) {
      throw new Error('getParameters: Could not parse response json');
    }

    if ('message' in response) {
      throw new Error(`getParameters: Blockfrost threw "${response.message}"`);
    }

    // Build cost models
    const costModels: CostModels = new Map();
    for (const cm of Object.keys(response.cost_models) as BlockfrostLanguageVersions[]) {
      const costModel: number[] = [];
      const keys = Object.keys(response.cost_models[cm]).sort();
      for (const key of keys) {
        costModel.push(response.cost_models[cm][key]!);
      }

      costModels.set(fromBlockfrostLanguageVersion(cm), costModel);
    }

    return {
      coinsPerUtxoByte: response.coins_per_utxo_size,
      maxTxSize: response.max_tx_size,
      minFeeCoefficient: response.min_fee_a,
      minFeeConstant: response.min_fee_b,
      maxBlockBodySize: response.max_block_size,
      maxBlockHeaderSize: response.max_block_header_size,
      stakeKeyDeposit: response.key_deposit,
      poolDeposit: response.pool_deposit,
      poolRetirementEpochBound: response.e_max,
      desiredNumberOfPools: response.n_opt,
      poolInfluence: response.a0,
      monetaryExpansion: response.rho,
      treasuryExpansion: response.tau,
      minPoolCost: response.min_pool_cost,
      protocolVersion: {
        major: response.protocol_major_ver,
        minor: response.protocol_minor_ver,
      },
      maxValueSize: response.max_val_size,
      collateralPercentage: response.collateral_percent / 100,
      maxCollateralInputs: response.max_collateral_inputs,
      costModels: costModels,
      prices: {
        memory: parseFloat(response.price_mem),
        steps: parseFloat(response.price_step),
      },
      maxExecutionUnitsPerTransaction: {
        memory: response.max_tx_ex_mem,
        steps: response.max_tx_ex_steps,
      },
      maxExecutionUnitsPerBlock: {
        memory: response.max_block_ex_mem,
        steps: response.max_block_ex_steps,
      },
    };
  }

  async getUnspentOutputs(address: Address): Promise<TransactionUnspentOutput[]> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      body: JSON.stringify({
        method: 'getUnspentOutputs',
        address: address.toBech32().toString(),
      }),
    });

    const { utxos } = await res.json<{ utxos: BlockfrostUTxO[] }>();

    const buildTxUnspentOutput = this.buildTransactionUnspentOutput(address);

    const mappedUtxos: TransactionUnspentOutput[] = [];

    for (const utxo of utxos) {
      const mappedUtxo = await buildTxUnspentOutput(utxo);

      mappedUtxos.push(mappedUtxo);
    }

    return mappedUtxos;
  }

  async getUnspentOutputsWithAsset(
    address: Address,
    unit: AssetId,
  ): Promise<TransactionUnspentOutput[]> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      body: JSON.stringify({
        method: 'getUnspentOutputsWithAsset',
        address: address.toBech32().toString(),
        unit,
      }),
    });

    const { utxos } = await res.json<{ utxos: BlockfrostUTxO[] }>();

    const buildTxUnspentOutput = this.buildTransactionUnspentOutput(address);

    const mappedUtxos: TransactionUnspentOutput[] = [];

    for (const utxo of utxos) {
      const mappedUtxo = await buildTxUnspentOutput(utxo);

      mappedUtxos.push(mappedUtxo);
    }

    return mappedUtxos;
  }

  async getUnspentOutputByNFT(unit: AssetId): Promise<TransactionUnspentOutput> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      body: JSON.stringify({
        method: 'getUnspentOutputByNFT',
        unit,
      }),
    });

    const { utxo } = await res.json<{ utxo: BlockfrostUTxO }>();

    const buildTxUnspentOutput = this.buildTransactionUnspentOutput(
      Address.fromBech32(utxo.address),
    );

    const mappedUtxo = await buildTxUnspentOutput(utxo);

    return mappedUtxo;
  }

  async resolveUnspentOutputs(txIns: TransactionInput[]): Promise<TransactionUnspentOutput[]> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      body: JSON.stringify({
        method: 'resolveUnspentOutputs',
        inputs: txIns.map((txIn) => ({
          transactionId: txIn.transactionId(),
          index: Number(txIn.index()),
        })),
      }),
    });

    const { utxos } = await res.json<{ utxos: BlockfrostUTxO[] }>();

    const mappedUtxos: TransactionUnspentOutput[] = [];

    for (const utxo of utxos) {
      const buildTxUnspentOutput = this.buildTransactionUnspentOutput(
        Address.fromBech32(utxo.address),
      );

      const mappedUtxo = await buildTxUnspentOutput(utxo);

      mappedUtxos.push(mappedUtxo);
    }

    return mappedUtxos;
  }

  async resolveDatum(datumHash: DatumHash): Promise<PlutusData> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      body: JSON.stringify({
        method: 'resolveDatum',
        datumHash: datumHash.toString(),
      }),
    });

    const { datum } = await res.json<{ datum: string }>();

    return PlutusData.fromCbor(HexBlob(datum));
  }

  async awaitTransactionConfirmation(txId: TransactionId, timeout?: number): Promise<boolean> {
    const averageBlockTime = 20_000;

    if (timeout && timeout < averageBlockTime) {
      console.warn('Warning: timeout given is less than average block time.');
    }

    const startTime = Date.now();

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const checkConfirmation = async () => {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        body: JSON.stringify({
          method: 'awaitTransactionConfirmation',
          txId,
        }),
      });

      const { answer } = await response.json<{ answer: boolean }>();

      return answer;
    };

    if (await checkConfirmation()) {
      return true;
    }

    if (timeout) {
      while (Date.now() - startTime < timeout) {
        await delay(averageBlockTime);

        if (await checkConfirmation()) {
          return true;
        }
      }
    }

    return false;
  }

  async postTransactionToChain(tx: Transaction): Promise<TransactionId> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      body: JSON.stringify({
        method: 'postTransactionToChain',
        tx: tx.toCbor().toString(),
      }),
    });

    const { txId } = await res.json<{ txId: string }>();

    return TransactionId.fromHexBlob(HexBlob(txId));
  }

  async evaluateTransaction(
    tx: Transaction,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    additionalUtxos: TransactionUnspentOutput[],
  ): Promise<Redeemers> {
    const currentRedeemers = tx.witnessSet().redeemers()?.values();
    if (!currentRedeemers || currentRedeemers.length === 0) {
      throw new Error(`evaluateTransaction: No Redeemers found in transaction"`);
    }

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      body: JSON.stringify(
        {
          method: 'evaluateTransaction',
          tx: tx.toCbor().toString(),
        },
        (_, value) => (typeof value === 'bigint' ? Number(value) : value),
      ),
    });

    const result = await res.json<
      {
        budget: { memory: number; cpu: number };
        validator: { index: number; purpose: string };
      }[]
    >();

    const evaledRedeemers: Set<Redeemer> = new Set();

    for (const evalResult of result) {
      const purpose = purposeFromTag(evalResult.validator.purpose);
      const index = BigInt(evalResult.validator.index);

      const exUnits = ExUnits.fromCore({
        memory: evalResult.budget.memory,
        steps: evalResult.budget.cpu,
      });

      const redeemer = currentRedeemers!.find(
        (x: Redeemer) => x.tag() == purpose && x.index() == index,
      );

      if (!redeemer) {
        throw new Error('evaluateTransaction: Blockfrost endpoint had extraneous redeemer data');
      }

      // Manually set exUnits for redeemer
      redeemer.setExUnits(exUnits);

      // Add redeemer to result set
      evaledRedeemers.add(redeemer);
    }

    // Build return value from evaluated result set
    return Redeemers.fromCore(Array.from(evaledRedeemers).map((x) => x.toCore()));
  }

  // Partially applies address in order to avoid sending it
  // as argument repeatedly when building TransactionUnspentOutput
  private buildTransactionUnspentOutput(
    address: Address,
  ): (blockfrostUTxO: BlockfrostUTxO) => Promise<TransactionUnspentOutput> {
    return async (blockfrostUTxO) => {
      const txIn = new TransactionInput(
        TransactionId(blockfrostUTxO.tx_hash),
        BigInt(blockfrostUTxO.output_index),
      );

      // No tx output CBOR available from Blockfrost,
      // so TransactionOutput must be manually constructed.
      const tokenMap: TokenMap = new Map<AssetId, bigint>();

      let lovelace = 0n;

      for (const { unit, quantity } of blockfrostUTxO.amount) {
        if (unit === 'lovelace') {
          lovelace = BigInt(quantity);
        } else {
          tokenMap.set(unit as AssetId, BigInt(quantity));
        }
      }

      const txOut = new TransactionOutput(address, new Value(lovelace, tokenMap));

      const datum = blockfrostUTxO.inline_datum
        ? Datum.newInlineData(PlutusData.fromCbor(HexBlob(blockfrostUTxO.inline_datum)))
        : blockfrostUTxO.data_hash
          ? Datum.newDataHash(DatumHash(blockfrostUTxO.data_hash))
          : undefined;

      if (datum) txOut.setDatum(datum);

      if (blockfrostUTxO.script_ref) {
        const cbor = HexBlob(blockfrostUTxO.script_ref.cbor);

        switch (blockfrostUTxO.script_ref.type) {
          case 'plutusV1': {
            const scriptRef = Script.newPlutusV1Script(new PlutusV1Script(cbor));

            txOut.setScriptRef(scriptRef);

            break;
          }
          case 'plutusV2': {
            const scriptRef = Script.newPlutusV2Script(new PlutusV2Script(cbor));

            txOut.setScriptRef(scriptRef);

            break;
          }
        }
      }

      return new TransactionUnspentOutput(txIn, txOut);
    };
  }
}

export function createBlaze(wallet: CIP30Interface) {
  return Blaze.from(new BrowserProvider(), new WebWallet(wallet));
}

function purposeFromTag(tag: string): RedeemerTag {
  const tagMap: { [key: string]: RedeemerTag } = {
    spend: RedeemerTag.Spend,
    mint: RedeemerTag.Mint,
    cert: RedeemerTag.Cert,
    withdraw: RedeemerTag.Reward,
    voting: RedeemerTag.Voting,
    proposing: RedeemerTag.Proposing,
  };

  const normalizedTag = tag.toLowerCase();

  if (normalizedTag in tagMap) {
    return tagMap[normalizedTag]!;
  } else {
    throw new Error(`Invalid tag: ${tag}.`);
  }
}

type BlockfrostLanguageVersions = 'PlutusV1' | 'PlutusV2' | 'PlutusV3';
export const fromBlockfrostLanguageVersion = (
  x: BlockfrostLanguageVersions,
): PlutusLanguageVersion => {
  if (x == 'PlutusV1') {
    return PlutusLanguageVersion.V1;
  } else if (x == 'PlutusV2') {
    return PlutusLanguageVersion.V2;
  } else if (x == 'PlutusV3') {
    return PlutusLanguageVersion.V3;
  }
  throw new Error('fromBlockfrostLanguageVersion: Unreachable!');
};

export interface BlockfrostProtocolParametersResponse {
  epoch: number;
  min_fee_a: number;
  min_fee_b: number;
  max_block_size: number;
  max_tx_size: number;
  max_block_header_size: number;
  key_deposit: number;
  pool_deposit: number;
  e_max: number;
  n_opt: number;
  a0: string;
  rho: string;
  tau: string;
  decentralisation_param: number;
  extra_entropy: null;
  protocol_major_ver: number;
  protocol_minor_ver: number;
  min_utxo: string;
  min_pool_cost: number;
  nonce: string;
  cost_models: Record<BlockfrostLanguageVersions, { [key: string]: number }>;
  price_mem: string;
  price_step: string;
  max_tx_ex_mem: number;
  max_tx_ex_steps: number;
  max_block_ex_mem: number;
  max_block_ex_steps: number;
  max_val_size: number;
  collateral_percent: number;
  max_collateral_inputs: number;
  coins_per_utxo_size: number;
}

type BlockfrostResponse<SomeResponse> = SomeResponse | { message: string };

interface BlockfrostUTxO {
  address: string;
  tx_hash: string;
  output_index: number;
  amount: {
    unit: string;
    quantity: string;
  }[];
  block: string;
  data_hash?: string;
  inline_datum?: string;
  reference_script_hash?: string;
  script_ref?: { type: 'plutusV1' | 'plutusV2'; cbor: string };
}
