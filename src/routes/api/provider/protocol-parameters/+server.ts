import { json } from '@sveltejs/kit';
import { WebSocket } from 'ws';

import { OGMIOS_URL } from '$env/static/private';

export async function GET() {
  const client = new WebSocket(OGMIOS_URL);

  await new Promise((res) => {
    client.addEventListener('open', () => res(1), { once: true });
  });

  client.send(
    JSON.stringify({
      type: 'jsonwsp/request',
      version: '1.0',
      servicename: 'ogmios',
      methodname: 'Query',
      args: {
        query: 'currentProtocolParameters',
      },
    }),
  );

  const params = await new Promise((res, rej) => {
    client.addEventListener(
      'message',
      (msg: MessageEvent<string>) => {
        try {
          const { result } = JSON.parse(msg.data);

          res(result);
        } catch (e) {
          rej(e);
        }
      },
      { once: true },
    );
  });

  return json(params);
}
