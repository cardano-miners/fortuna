import { writable, type Writable } from 'svelte/store';
import type { Blaze, CIP30Interface, WebWallet } from '@blaze-cardano/sdk';
import { BrowserProvider } from '$lib/utils/provider';
import { Address } from '@blaze-cardano/core';
import { WalletOption } from '../../app';

export const v1TunaAmount: Writable<bigint> = writable(0n);
export const v2TunaAmount: Writable<bigint> = writable(0n);
export const walletApi: Writable<CIP30Interface | undefined> = writable(undefined);
export const walletOption: Writable<WalletOption | undefined> = writable(undefined);
export const wallet: Writable<WebWallet | undefined> = writable(undefined);
export const userAddress: Writable<Address | undefined> = writable(undefined);
export const blaze: Writable<Blaze<BrowserProvider, WebWallet> | undefined> = writable(undefined);
