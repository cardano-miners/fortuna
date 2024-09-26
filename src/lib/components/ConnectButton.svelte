<script lang="ts">
  import { onMount } from 'svelte';
  import { makeUplcEvaluator } from '@blaze-cardano/vm';

  import geroIcon from '$lib/assets/geroicon.png';
  import fortunaIconBlack from '$lib/assets/fortunaIconBlack.png';
  import {
    v1TunaAmount,
    v2TunaAmount,
    wallet,
    walletApi,
    walletOption,
    userAddress,
    blaze,
  } from '$lib/store';
  import { TUNA_ASSET_NAME, V1_TUNA_POLICY_ID, V2_TUNA_POLICY_ID } from '$lib/constants';
  import { createBlaze } from '$lib/utils/provider';
  import { AssetId } from '@blaze-cardano/core';
  import type { Cardano } from '../../app';

  let open = $state(false);

  let wallets: [string, Cardano['']][] = $state([]);

  // change to the sew address later OR just hide/delete this component inside /Navbar.svelte after the hardfork
  let tunaButLink =
    'https://app.dexhunter.io/swap?tokenIdSell=&tokenIdBuy=c981fc98e761e3bb44ae35e7d97ae6227f684bcb6f50a636753da48e54554e41';

  const WalletNames = [
    'flint',
    'nami',
    'eternl',
    'gerowallet',
    'nufi',
    'begin',
    'lace',
    'yoroi',
    'begin',
    'typhoncip30',
  ];

  function disconnect() {
    $wallet = undefined;
    $walletApi = undefined;
  }

  async function connect(walletKey: string) {
    $walletOption = window.cardano?.[walletKey];

    $walletApi = await $walletOption?.enable();

    $blaze = await createBlaze($walletApi!);

    $blaze.provider.evaluateTransaction = makeUplcEvaluator($blaze.params, 2, 2);

    open = false;
  }

  $effect(() => {
    async function getTunaBalance() {
      if ($blaze) {
        const addresses = await $blaze.wallet.getUnusedAddresses();

        $userAddress = addresses[0];

        if ($userAddress) {
          const assetId = AssetId(V1_TUNA_POLICY_ID + TUNA_ASSET_NAME);
          const assetIdV2 = AssetId(V2_TUNA_POLICY_ID + TUNA_ASSET_NAME);

          const utxos = await $blaze.provider.getUnspentOutputsWithAsset($userAddress, assetId);
          const utxosV2 = await $blaze.provider.getUnspentOutputsWithAsset($userAddress, assetIdV2);

          $v1TunaAmount = utxos.reduce((acc, u) => {
            return acc + (u.output().amount().multiasset()?.get(assetId) ?? 0n);
          }, 0n);

          $v2TunaAmount = utxosV2.reduce((acc, u) => {
            return acc + (u.output().amount().multiasset()?.get(assetIdV2) ?? 0n);
          }, 0n);
        }
      }
    }

    getTunaBalance();
  });

  onMount(async () => {
    if (typeof window.cardano !== 'undefined') {
      wallets = Object.entries(window.cardano)
        .filter(([key, value]) => typeof value === 'object' && WalletNames.includes(key))
        .map(([key, value]) => [key, value]);

      for (const [key, walletOpt] of wallets) {
        const isEnabled = await walletOpt.isEnabled();

        if (isEnabled) {
          connect(key);
          break;
        }
      }
    }
  });
</script>

{#if $walletOption}
  <div class="dropdown dropdown-hover md:dropdown-bottom">
    <div tabIndex={0} role="button" class="btn btn-accent btn-outline">
      <img
        src={$walletOption.name === 'GeroWallet' ? geroIcon : $walletOption.icon}
        alt="logo"
        class="w-6 h-6 justify-center"
      />
    </div>
    <ul
      tabIndex={0}
      class="dropdown-content bg-slate-800 z-[1] menu md:-ml-36 p-2 shadow rounded-box w-52 gap-1"
    >
      {#if $v1TunaAmount > 0n}
        <li class="mt-2">
          <button class="indicator w-full btn btn-sm btn-accent">
            V1 <img src={fortunaIconBlack} alt="fortuna icon" class="w-4 h-4 justify-center" />
            {($v1TunaAmount / 100_000_000n).toLocaleString('en-US')}
          </button>
        </li>
      {/if}

      {#if $v2TunaAmount > 0n}
        <li class="mt-2">
          <button class="indicator w-full btn btn-sm btn-accent">
            V2 <img src={fortunaIconBlack} alt="fortuna icon" class="w-4 h-4 justify-center" />
            {($v2TunaAmount / 100_000_000n).toLocaleString('en-US')}
          </button>
        </li>
      {/if}

      {#if $v1TunaAmount > 0n}
        <li class="mt-2">
          <a href="/hardfork" class="indicator w-full btn btn-sm">
            <span class="indicator-item indicator-top indicator-end badge badge-secondary">
              TUNA V2
            </span>
            Redeem
          </a>
        </li>
      {:else}
        <li class="mt-2">
          <a href="/mine" class="indicator w-full btn btn-sm">
            <span class="indicator-item indicator-top indicator-end badge badge-secondary">
              Mine Now
            </span>
            Get Tuna
          </a>
        </li>

        <li class="">
          <a href={tunaButLink} target="_blank" class=" w-full btn btn-sm">Buy on DexHunter</a>
        </li>
      {/if}

      <li class="mt-4">
        <button class="btn btn-danger" onclick={disconnect}>Disconnect</button>
      </li>
    </ul>
  </div>
{:else}
  <button
    class="btn btn-primary"
    onclick={() => {
      open = true;
    }}
  >
    Connect
  </button>
  <dialog id="my_modal_1" class="modal modal-middle" {open}>
    <div class="modal-box flex flex-col border border-gray-700 bg-base-300 gap-4 md:gap-8">
      <h3 class="font-bold text-lg text-center">Select a wallet</h3>

      {#each wallets as [key, value]}
        <button
          class="btn btn-ghost flex items-center justify-center gap-2"
          onclick={(e) => {
            e.preventDefault();

            connect(key);
          }}
        >
          <img
            src={value.name === 'GeroWallet' ? geroIcon : value.icon}
            alt={value.name}
            class="w-6 h-6"
          />
          <span class="capitalize">{value.name}</span>
        </button>
      {/each}

      <div class="modal-action">
        <form method="dialog">
          <button
            class="btn"
            onclick={() => {
              open = false;
            }}
          >
            Close
          </button>
        </form>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button
        onclick={() => {
          open = false;
        }}
      >
        close
      </button>
    </form>
  </dialog>
{/if}
