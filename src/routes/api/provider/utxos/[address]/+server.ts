import { json } from '@sveltejs/kit';

import { RequestEvent } from './$types';

export function GET(event: RequestEvent) {
  return json({ wow: event.params.address });
}
