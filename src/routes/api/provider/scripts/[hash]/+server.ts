import { json } from '@sveltejs/kit';

import { KUPO_URL } from '$env/static/private';

import { RequestEvent } from './$types';

export async function GET({ params }: RequestEvent) {
  const response = await fetch(`${KUPO_URL}/scripts/${params.hash}`);

  const result = await response.json();

  return json(result);
}
