import { json } from '@sveltejs/kit';

import { KUPO_URL } from '$env/static/private';

import { RequestEvent } from './$types';

export async function GET({ params, url }: RequestEvent) {
  const response = await fetch(
    `${KUPO_URL}/matches/${params.address}${
      url.searchParams.get('isAddress') === 'true' ? '' : '/*'
    }?unspent`,
  );

  const utxos = await response.json();

  return json({ utxos });
}
