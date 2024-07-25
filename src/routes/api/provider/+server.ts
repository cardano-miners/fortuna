import { json } from '@sveltejs/kit';

import { RequestEvent } from './$types';

import { newProvider } from '$lib/server/blaze';
import {
  Address,
  AssetId,
  DatumHash,
  HexBlob,
  Transaction,
  TransactionInput,
  TransactionUnspentOutput,
  TxCBOR,
} from '@blaze-cardano/core';

type ProviderRequest =
  | { method: 'getParameters' }
  | { method: 'getUnspentOutputs'; address: string }
  | { method: 'getUnspentOutputsWithAsset'; address: string; unit: string }
  | { method: 'getUnspentOutputByNFT'; unit: string }
  | { method: 'resolveUnspentOutputs'; inputs: string[] }
  | { method: 'resolveDatum'; datumHash: string }
  | { method: 'awaitTransactionConfirmation'; txId: string; timeout?: number }
  | { method: 'postTransactionToChain'; tx: string }
  | { method: 'evaluateTransaction'; tx: string; additionalUtxos: string[] };

export async function POST({ request }: RequestEvent) {
  const allowedOrigin = 'http://localhost:5173';
  const origin = request.headers.get('origin');

  if (origin !== allowedOrigin) {
    return json({
      status: 403,
      body: 'Forbidden: Cross-origin requests are not allowed',
    });
  }

  const provider = newProvider();

  const payload = await request.json<ProviderRequest>();

  switch (payload.method) {
    case 'getParameters': {
      const parameters = await provider.getParameters();

      return json({ parameters });
    }
    case 'getUnspentOutputs': {
      const address = Address.fromBech32(payload.address);

      const utxos = await provider.getUnspentOutputs(address);

      return json({ utxos });
    }
    case 'getUnspentOutputsWithAsset': {
      const address = Address.fromBech32(payload.address);
      const unit = AssetId(payload.unit);

      const utxos = await provider.getUnspentOutputsWithAsset(address, unit);

      return json({ utxos });
    }
    case 'getUnspentOutputByNFT': {
      const unit = AssetId(payload.unit);

      const utxo = await provider.getUnspentOutputByNFT(unit);

      return json({ utxo });
    }
    case 'resolveUnspentOutputs': {
      const inputs = payload.inputs.map((input) => TransactionInput.fromCbor(HexBlob(input)));

      const utxos = await provider.resolveUnspentOutputs(inputs);

      return json({ utxos });
    }
    case 'resolveDatum': {
      const datum = await provider.resolveDatum(DatumHash(payload.datumHash));

      return json({ datum: datum.toCbor().toString() });
    }
    case 'awaitTransactionConfirmation': {
      return json({});
    }
    case 'postTransactionToChain': {
      const tx = Transaction.fromCbor(TxCBOR(payload.tx));

      const txId = await provider.postTransactionToChain(tx);

      return json({ txId: txId.toString() });
    }
    case 'evaluateTransaction': {
      const tx = Transaction.fromCbor(TxCBOR(payload.tx));
      const additionalUtxos = payload.additionalUtxos.map((utxo) =>
        TransactionUnspentOutput.fromCbor(HexBlob(utxo)),
      );

      const redeemers = await provider.evaluateTransaction(tx, additionalUtxos);

      return json({ redeemers: redeemers.toCbor().toString() });
    }
    default:
      return json({ error: 'Method not found' });
  }
}
