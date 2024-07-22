import { Kupmios } from '@blaze-cardano/sdk';

import { KUPO_URL, OGMIOS_URL } from '$env/static/private';

export function newKupmios() {
  const provider = new Kupmios(KUPO_URL, OGMIOS_URL);

  return provider;
}
