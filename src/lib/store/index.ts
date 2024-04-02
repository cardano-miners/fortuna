import { writable, type Writable } from 'svelte/store';
import type { Translucent, Cardano, WalletApi } from 'translucent-cardano';

export const v1TunaAmount: Writable<bigint> = writable(0n);
export const walletApi: Writable<WalletApi | undefined> = writable(undefined);
export const wallet: Writable<Cardano[''] | undefined> = writable(undefined);
export const userAddress: Writable<string | undefined> = writable(undefined);
export const translucent: Writable<Translucent | undefined> = writable(undefined);
