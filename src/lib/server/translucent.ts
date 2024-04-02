import { Translucent, KupmiosV5 as Kupmios } from 'translucent-cardano';
import { WebSocket } from 'ws';

Object.assign(global, { WebSocket });

import { KUPO_URL, OGMIOS_URL } from '$env/static/private';

const provider = new Kupmios(KUPO_URL, OGMIOS_URL);

export const translucent = await Translucent.new(provider, 'Mainnet');
