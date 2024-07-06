import { Lucid, Kupmios } from 'lucid-cardano';
import { WebSocket } from 'ws';

Object.assign(global, { WebSocket });

import { KUPO_URL, OGMIOS_URL } from '$env/static/private';

const provider = new Kupmios(KUPO_URL, OGMIOS_URL);

export const translucent = await Lucid.new(provider, 'Mainnet');
