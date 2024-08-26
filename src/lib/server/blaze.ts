import { Unwrapped } from '@blaze-cardano/ogmios';

import { BLOCKFROST_URL, OGMIOS_URL } from '$env/static/private';

export async function newProvider() {
  const provider = new Blockfrost(BLOCKFROST_URL);

  return provider;
}

export class Blockfrost {
  url: string;

  constructor(url: string) {
    this.url = `${url}`;
  }

  /**
   * This method fetches the protocol parameters from the Blockfrost API.
   * It constructs the query URL, sends a GET request with the appropriate headers, and processes the response.
   * The response is parsed into a ProtocolParameters object, which is then returned.
   * If the response is not in the expected format, an error is thrown.
   * @returns A Promise that resolves to a ProtocolParameters object.
   */
  async getParameters(): Promise<Response> {
    const query = '/epochs/latest/parameters';

    return fetch(`${this.url}${query}`);
  }

  /**
   * This method fetches the UTxOs under a given address.
   * The response is parsed into a TransactionUnspentOutput[] type, which is
   * then returned.
   * If the response is not in the expected format, an error is thrown.
   * @param address - The Address or Payment Credential
   * @returns A Promise that resolves to TransactionUnspentOutput[].
   */
  async getUnspentOutputs(bech32: string): Promise<BlockfrostUTxO[]> {
    // 100 per page is max allowed by Blockfrost
    const maxPageCount = 100;
    let page = 1;

    const results: Set<BlockfrostUTxO> = new Set();

    for (;;) {
      const pagination = `count=${maxPageCount}&page=${page}`;
      const query = `/addresses/${bech32}/utxos?${pagination}`;
      const json = await fetch(`${this.url}${query}`).then((resp) => resp.json());

      if (!json) {
        throw new Error('getUnspentOutputs: Could not parse response json');
      }

      const response = json as BlockfrostResponse<BlockfrostUTxO[]>;

      if ('message' in response) {
        throw new Error(`getUnspentOutputs: Blockfrost threw "${response.message}"`);
      }

      for (const blockfrostUTxO of response) {
        if (blockfrostUTxO.reference_script_hash) {
          blockfrostUTxO.script_ref = await this.getScriptRef(blockfrostUTxO.reference_script_hash);
        }

        results.add(blockfrostUTxO);
      }

      if (response.length < maxPageCount) {
        break;
      } else {
        page = page + 1;
      }
    }

    return Array.from(results);
  }

  /**
   * This method fetches the UTxOs under a given address that hold
   * a particular asset.
   * The response is parsed into a TransactionUnspentOutput[] type, which is
   * then returned.
   * If the response is not in the expected format, an error is thrown.
   * @param address - Address or Payment Credential.
   * @param unit - The AssetId
   * @returns A Promise that resolves to TransactionUnspentOutput[].
   */
  async getUnspentOutputsWithAsset(bech32: string, asset: string): Promise<BlockfrostUTxO[]> {
    // 100 per page is max allowed by Blockfrost
    const maxPageCount = 100;
    let page = 1;

    const results: Set<BlockfrostUTxO> = new Set();

    for (;;) {
      const pagination = `count=${maxPageCount}&page=${page}`;
      const query = `/addresses/${bech32}/utxos/${asset}?${pagination}`;
      const json = await fetch(`${this.url}${query}`).then((resp) => resp.json());

      if (!json) {
        throw new Error('getUnspentOutputsWithAsset: Could not parse response json');
      }

      const response = json as BlockfrostResponse<BlockfrostUTxO[]>;

      if ('message' in response) {
        throw new Error(`getUnspentOutputsWithAsset: Blockfrost threw "${response.message}"`);
      }

      for (const blockfrostUTxO of response) {
        if (blockfrostUTxO.reference_script_hash) {
          blockfrostUTxO.script_ref = await this.getScriptRef(blockfrostUTxO.reference_script_hash);
        }

        results.add(blockfrostUTxO);
      }

      if (response.length < maxPageCount) {
        break;
      } else {
        page = page + 1;
      }
    }

    return Array.from(results);
  }

  /**
   * This method fetches the UTxO that holds a particular NFT given as
   * argument.
   * The response is parsed into a TransactionUnspentOutput type, which is
   * then returned.
   * If the response is not in the expected format, an error is thrown.
   * @param nft - The AssetId for the NFT
   * @returns A Promise that resolves to TransactionUnspentOutput.
   */
  async getUnspentOutputByNFT(asset: string): Promise<BlockfrostUTxO> {
    // Fetch addresses holding the asset. Since it's an NFT, a single
    // address is expected to be returned
    const query = `/assets/${asset}/addresses`;
    const json = await fetch(`${this.url}${query}`).then((resp) => resp.json());

    if (!json) {
      throw new Error('getUnspentOutputByNFT: Could not parse response json');
    }

    const response = json as BlockfrostResponse<BlockfrostAssetAddress[]>;

    if ('message' in response) {
      throw new Error(`getUnspentOutputByNFT: Blockfrost threw "${response.message}"`);
    }
    // Ensures a single asset address is returned
    if (response.length !== 1) {
      throw new Error(
        'getUnspentOutputByNFT: Asset must be held by only one address. Multiple found.',
      );
    }

    const utxo = response[0] as BlockfrostAssetAddress;
    // A second call to Blockfrost is needed in order to fetch utxo information
    const utxos = await this.getUnspentOutputsWithAsset(utxo.address, asset);

    // Ensures a single UTxO holds the asset
    if (utxos.length !== 1) {
      throw new Error(
        'getUnspentOutputByNFT: Asset must be present in only one UTxO. Multiple found.',
      );
    }

    return utxos[0]!;
  }

  /**
   * This method resolves transaction outputs from a list of transaction
   * inputs given as argument.
   * The response is parsed into a TransactionUnspentOutput[] type, which is
   * then returned.
   * If the response is not in the expected format, an error is thrown.
   * @param txIns - A list of TransactionInput
   * @returns A Promise that resolves to TransactionUnspentOutput[].
   */
  async resolveUnspentOutputs(
    txIns: { transactionId: string; index: number }[],
  ): Promise<BlockfrostUTxO[]> {
    const results: Set<BlockfrostUTxO> = new Set();

    for (const txIn of txIns) {
      const query = `/txs/${txIn.transactionId}/utxos`;
      const json = await fetch(`${this.url}${query}`).then((resp) => resp.json());

      if (!json) {
        throw new Error('resolveUnspentOutputs: Could not parse response json');
      }

      const response = json as BlockfrostResponse<BlockfrostUnspentOutputResolution>;

      if ('message' in response) {
        throw new Error(`resolveUnspentOutputs: Blockfrost threw "${response.message}"`);
      }

      const txIndex = BigInt(txIn.index);

      for (const blockfrostUTxO of response.outputs) {
        if (BigInt(blockfrostUTxO.output_index) !== txIndex) {
          // Ignore outputs whose index don't match
          // the index we are looking for
          continue;
        }

        // Blockfrost API does not return tx hash, so it must be manually set
        blockfrostUTxO.tx_hash = txIn.transactionId;

        if (blockfrostUTxO.reference_script_hash) {
          blockfrostUTxO.script_ref = await this.getScriptRef(blockfrostUTxO.reference_script_hash);
        }

        results.add(blockfrostUTxO);
      }
    }

    return Array.from(results);
  }

  /**
   * This method returns the datum for the datum hash given as argument.
   * The response is parsed into a PlutusData type, which is then returned.
   * If the response is not in the expected format, an error is thrown.
   * @param datumHash - The hash of a datum
   * @returns A Promise that resolves to PlutusData
   */
  async resolveDatum(datumHash: string): Promise<string> {
    const query = `/scripts/datum/${datumHash}/cbor`;
    const json = await fetch(`${this.url}${query}`).then((resp) => resp.json());

    if (!json) {
      throw new Error('resolveDatum: Could not parse response json');
    }

    const response = json as BlockfrostResponse<BlockfrostDatumHashResolution>;

    if ('message' in response) {
      throw new Error(`resolveDatum: Blockfrost threw "${response.message}"`);
    }

    return response.cbor;
  }

  /**
   * This method awaits confirmation of the transaction given as argument.
   * The response is parsed into a boolean, which is then returned.
   * If tx is not confirmed at first and no value for timeout is provided,
   * then false is returned.
   * If tx is not confirmed at first and a value for timeout (in ms) is given,
   * then subsequent checks will be performed at a 20 second interval until
   * timeout is reached.
   * @param txId - The hash of a transaction
   * @param timeout - An optional timeout for waiting for confirmation. This
   * value should be greater than average block time of 20000 ms
   * @returns A Promise that resolves to a boolean
   */
  async awaitTransactionConfirmation(txId: string): Promise<boolean> {
    const query = `/txs/${txId}/metadata/cbor`;

    const response = await fetch(`${this.url}${query}`);

    return response.ok;
  }

  /**
   * This method submits a transaction to the chain.
   * @param tx - The Transaction
   * @returns A Promise that resolves to a TransactionId type
   */
  async postTransactionToChain(tx: string): Promise<string> {
    const query = '/tx/submit';
    const response = await fetch(`${this.url}${query}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/cbor',
        Accept: 'text/plain',
      },
      body: tx,
    });

    if (!response.ok) {
      const error = await response.text();

      throw new Error(
        `postTransactionToChain: failed to submit transaction to Blockfrost endpoint.\nError ${error}`,
      );
    }

    const txId = await response.text();

    return txId;
  }

  /**
   * This method evaluates how much execution units a transaction requires.
   * Optionally, additional outputs can be provided. These are added to the
   * evaluation without checking for their presence on-chain. This is useful
   * when performing transaction chaining, where some outputs used as inputs
   * to a transaction will have not yet been submitted to the network.
   * @param tx - The Transaction
   * @param additionalUtxos - Optional utxos to be added to the evaluation.
   * @returns A Promise that resolves to a Redeemers type
   */
  async evaluateTransaction(tx: string): Promise<unknown> {
    const ogmios = await Unwrapped.Ogmios.new(OGMIOS_URL);

    return await ogmios.evaluateTransaction({ cbor: tx });
  }

  private async getScriptRef(
    scriptHash: string,
  ): Promise<{ type: 'plutusV1' | 'plutusV2'; cbor: string }> {
    const typeQuery = `/scripts/${scriptHash}`;
    const typeJson = await fetch(`${this.url}${typeQuery}`).then((resp) => resp.json());

    if (!typeJson) {
      throw new Error('getScriptRef: Could not parse response json');
    }

    const typeResponse = typeJson as BlockfrostResponse<{
      type: 'timelock' | 'plutusV1' | 'plutusV2';
    }>;

    if ('message' in typeResponse) {
      throw new Error(`getScriptRef: Blockfrost threw "${typeResponse.message}"`);
    }

    const type = typeResponse.type;
    if (type == 'timelock') {
      throw new Error('getScriptRef: Native scripts are not yet supported.');
    }

    const cborQuery = `/scripts/${scriptHash}/cbor`;
    const cborJson = await fetch(`${this.url}${cborQuery}`).then((resp) => resp.json());

    if (!cborJson) {
      throw new Error('getScriptRef: Could not parse response json');
    }

    const cborResponse = cborJson as BlockfrostResponse<{
      cbor: string;
    }>;

    if ('message' in cborResponse) {
      throw new Error(`getScriptRef: Blockfrost threw "${cborResponse.message}"`);
    }

    const cbor = cborResponse.cbor;

    return { type, cbor };
  }
}

type BlockfrostLanguageVersions = 'PlutusV1' | 'PlutusV2' | 'PlutusV3';

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

interface BlockfrostAssetAddress {
  address: string;
  quantity: string;
}

interface BlockfrostUnspentOutputResolution {
  outputs: BlockfrostUTxO[];
}

interface BlockfrostDatumHashResolution {
  cbor: string;
}
