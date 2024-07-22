// See https://kit.svelte.dev/docs/types#app

import { CIP30Interface } from '@blaze-cardano/sdk';

// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    interface Platform {
      env: {
        DB: D1Database;
      };
    }
  }
}

type WalletOption = {
  name: string;
  icon: string;
  apiVersion: string;
  enable(): Promise<CIP30Interface>;
  isEnabled(): Promise<boolean>;
};

type Cardano = {
  [key: string]: WalletOption;
};

declare global {
  interface Window {
    cardano?: Cardano;
  }
}

export { Cardano, WalletApi, WalletOption };
