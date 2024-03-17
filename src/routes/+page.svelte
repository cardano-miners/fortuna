<script lang="ts">
  import { onMount } from 'svelte';
  import { type WalletOption, type WalletApi } from '../app.d';

  let open = false;
  let walletApi: WalletApi | undefined;
  let wallet: WalletOption | undefined;
  let tunaBalance = 0;
  let wallets: [string, WalletOption][] = [];

  async function connect(walletKey: string) {
    wallet = window.cardano?.[walletKey];
    walletApi = await wallet?.enable();

    open = false;
  }

  onMount(async () => {
    if (typeof window.cardano !== 'undefined') {
      wallets = Object.entries(window.cardano);

      for (const [key, walletOption] of wallets) {
        const isEnabled = await walletOption.isEnabled();

        if (isEnabled) {
          connect(key);
          break;
        }
      }
    }
  });
</script>

<div class="hero min-h-screen bg-base-200">
  <div class="hero-content text-center">
    <div class="max-w-md">
      <h1 class="text-5xl font-bold">Fortuna</h1>
      <p class="py-6">
        The hardfork is coming. In order to prepare for the hardfork lock your $TUNA by clicking
        this button. Locked $TUNA will be claimable on a new policy after the hardfork.
      </p>
      {#if walletApi && wallet}
        <button class="btn btn-primary"> Lock $TUNA </button>
      {:else}
        <button
          class="btn btn-primary"
          on:click={(e) => {
            open = true;
          }}>connect</button>
        <dialog id="my_modal_1" class="modal modal-bottom sm:modal-middle" {open}>
          <div class="modal-box flex flex-col gap-8">
            <h3 class="font-bold text-lg">Select a wallet</h3>

            {#each wallets as [key, value]}
              <button
                class="btn btn-ghost flex items-center justify-center gap-2"
                on:click={(e) => {
                  e.preventDefault();

                  connect(key);
                }}>
                <img src={value.icon} alt={value.name} class="w-6 h-6" />
                {value.name}
              </button>
            {/each}

            <div class="modal-action">
              <form method="dialog">
                <button
                  class="btn"
                  on:click={(_e) => {
                    open = false;
                  }}>Close</button>
              </form>
            </div>
          </div>
          <form method="dialog" class="modal-backdrop">
            <button
              on:click={(_e) => {
                open = false;
              }}>close</button>
          </form>
        </dialog>
      {/if}
    </div>
  </div>
</div>
