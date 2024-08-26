import { json } from '@sveltejs/kit';

import { RequestEvent } from './$types';

import { newProvider } from '$lib/server/blaze';

type ProviderRequest =
  | { method: 'getParameters' }
  | { method: 'getUnspentOutputs'; address: string }
  | { method: 'getUnspentOutputsWithAsset'; address: string; unit: string }
  | { method: 'getUnspentOutputByNFT'; unit: string }
  | { method: 'resolveUnspentOutputs'; inputs: { transactionId: string; index: number }[] }
  | { method: 'resolveDatum'; datumHash: string }
  | { method: 'awaitTransactionConfirmation'; txId: string }
  | { method: 'postTransactionToChain'; tx: string }
  | { method: 'evaluateTransaction'; tx: string; additionalUtxos: string[] };

export async function POST({ request }: RequestEvent) {
  // const allowedOrigin = 'https://minefortuna.com';
  // const origin = request.headers.get('origin');

  // if (origin !== allowedOrigin) {
  //   return json({
  //     status: 403,
  //     body: 'Forbidden: Cross-origin requests are not allowed',
  //   });
  // }

  const provider = await newProvider();

  const payload = await request.json<ProviderRequest>();

  switch (payload.method) {
    case 'getParameters': {
      return provider.getParameters();
    }
    case 'getUnspentOutputs': {
      const utxos = await provider.getUnspentOutputs(payload.address);

      return json({ utxos });
    }
    case 'getUnspentOutputsWithAsset': {
      const utxos = await provider.getUnspentOutputsWithAsset(payload.address, payload.unit);

      return json({ utxos });
    }
    case 'getUnspentOutputByNFT': {
      const utxo = await provider.getUnspentOutputByNFT(payload.unit);

      return json({ utxo });
    }
    case 'resolveUnspentOutputs': {
      const utxos = await provider.resolveUnspentOutputs(payload.inputs);

      return json({ utxos });
    }
    case 'resolveDatum': {
      const datum = await provider.resolveDatum(payload.datumHash);

      return json({ datum });
    }
    case 'awaitTransactionConfirmation': {
      const answer = await provider.awaitTransactionConfirmation(payload.txId);

      return json({ answer });
    }
    case 'postTransactionToChain': {
      const txId = await provider.postTransactionToChain(payload.tx);

      return json({ txId: txId.toString() });
    }
    case 'evaluateTransaction': {
      const redeemers = await provider.evaluateTransaction(payload.tx);

      return json(redeemers);
    }
    default:
      return json({ error: 'Method not found' });
  }
}
