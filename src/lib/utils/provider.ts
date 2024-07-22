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

    const { parameters } = await res.json<{ parameters: ProtocolParameters }>();

    return parameters;
  }

  async getUnspentOutputs(address: Address): Promise<TransactionUnspentOutput[]> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      body: JSON.stringify({
        method: 'getUnspentOutputs',
        address: address.toBech32().toString(),
      }),
    });

    const { utxos } = await res.json<{ utxos: TransactionUnspentOutput[] }>();

    return utxos;
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

    const { utxos } = await res.json<{ utxos: TransactionUnspentOutput[] }>();

    return utxos;
  }

  async getUnspentOutputByNFT(unit: AssetId): Promise<TransactionUnspentOutput> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      body: JSON.stringify({
        method: 'getUnspentOutputByNFT',
        unit,
      }),
    });

    const { utxo } = await res.json<{ utxo: TransactionUnspentOutput }>();

    return utxo;
  }

  async resolveUnspentOutputs(txIns: TransactionInput[]): Promise<TransactionUnspentOutput[]> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      body: JSON.stringify({
        method: 'resolveUnspentOutputs',
        txIns: txIns.map((txIn) => txIn.toCbor().toString()),
      }),
    });

    const { utxos } = await res.json<{ utxos: TransactionUnspentOutput[] }>();

    return utxos;
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

  awaitTransactionConfirmation(txId: TransactionId, timeout?: number): Promise<boolean> {
    throw new Error(`Method not implemented. ${txId} ${timeout}`);
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
    additionalUtxos: TransactionUnspentOutput[],
  ): Promise<Redeemers> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      body: JSON.stringify({
        method: 'evaluateTransaction',
        tx: tx.toCbor().toString(),
        additionalUtxos: additionalUtxos.map((utxo) => utxo.toCbor().toString()),
      }),
    });

    const { redeemers } = await res.json<{ redeemers: string }>();

    return Redeemers.fromCbor(HexBlob(redeemers));
  }
}

export function createBlaze(wallet: CIP30Interface) {
  return Blaze.from(new BrowserProvider(), new WebWallet(wallet));
}
