<script lang="ts">
  import SolarArrowRightBroken from '~icons/solar/arrow-right-broken';
  import { onMount } from 'svelte';
  import { type WalletOption, type WalletApi } from '../app.d';
  import { Constr, Translucent, C, Data } from 'translucent-cardano';

  let open = false;
  let walletApi: WalletApi | undefined;
  let wallet: WalletOption | undefined;
  let tunaBalance = 0;
  let wallets: [string, WalletOption][] = [];

  // button states
  let locking = false;

  async function connect(walletKey: string) {
    wallet = window.cardano?.[walletKey];
    walletApi = await wallet?.enable();

    open = false;
  }

  async function lockTuna() {
    locking = true;

    if (walletApi && wallet) {
      // TODO: lock $TUNA
      const lucid = await Translucent.new();

      const tunav1Policy = '';
      const hardforkScriptHash = '';

      const hardforkRewardAddress = lucid.utils.credentialToRewardAddress(
        lucid.utils.scriptHashToCredential(hardforkScriptHash),
      );

      const hardforkAddress = lucid.utils.credentialToAddress(
        lucid.utils.scriptHashToCredential(hardforkScriptHash),
      );

      const forkStateUtxo = (await lucid.utxosAt(hardforkScriptHash))[0];
      const lockStateUtxo = (await lucid.utxosAt(hardforkScriptHash))[1];
      const lockStateNft = '';

      const userTunaUtxos = await lucid.wallet.getUtxos();

      const lockStateDatum = new Constr(2, [5000000000n]);

      const hardforkStateRef = new Constr(0, [
        new Constr(0, [forkStateUtxo.txHash]),
        BigInt(forkStateUtxo.outputIndex),
      ]);

      const userNftOutputRef = new Constr(0, [
        new Constr(0, [userTunaUtxos[0].txHash]),
        BigInt(userTunaUtxos[0].outputIndex),
      ]);

      const userNftName = lucid.utils.datumToHash(Data.to(userNftOutputRef));

      const userNftDatum = new Constr(3, [userNftName]);

      const hardforkRedeemer = new Constr(1, [
        // hard fork state reference input
        hardforkStateRef,
        // lock state output index
        0n,
        // user nft output index
        1n,
        // user NFT ownership proof (for locking more tuna)
        new Constr(1, []),
        // Lock action is UserLock
        new Constr(1, []),
      ]);

      const lockTx = lucid
        .newTx()
        .readFrom([forkStateUtxo])
        .mintAssets({ [hardforkScriptHash + userNftName]: 1n }, Data.to(0n))
        .collectFrom([lockStateUtxo], Data.to(0n))
        .collectFrom(userTunaUtxos)
        .payToContract(
          hardforkAddress,
          { inline: Data.to(lockStateDatum) },
          { [hardforkScriptHash + lockStateNft]: 1n },
        )
        .payToContract(
          hardforkAddress,
          { inline: Data.to(userNftDatum) },
          {
            [tunav1Policy + 'TUNA']: 5000000000n,
          },
        )
        .withdraw(hardforkRewardAddress, 0n, Data.to(hardforkRedeemer))
        .complete();
    }

    setTimeout(() => {
      locking = false;
    }, 5000);
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

<div class="">
  <div
    class="flex max-w-[100vw] flex-col items-center justify-start xl:flex-row xl:items-start xl:justify-between">
    <div class="shrink xl:w-1/2">
      <div class="flex mt-[5vw] justify-center px-2 text-center xl:justify-start xl:text-start">
        <div class="py-5">
          <h1
            class="font-title xl:w-[115%] xl:text-start text-center text-[clamp(4rem,6vw,4.2rem)] font-black leading-[1.1] [word-break:auto-phrase] [:root[dir=rtl]_&]:leading-[1.35]">
            <span
              class="[&::selection]:text-base-content brightness-150 contrast-150 [&::selection]:bg-blue-700/20">
              Welcome to
            </span>
            <br />
            <span class="inline-grid">
              <span
                class="pointer-events-none col-start-1 row-start-1 bg-[linear-gradient(90deg,theme(colors.error)_0%,theme(colors.secondary)_9%,theme(colors.secondary)_42%,theme(colors.primary)_47%,theme(colors.accent)_100%)] bg-clip-text blur-xl [-webkit-text-fill-color:transparent] [transform:translate3d(0,0,0)] before:content-[attr(data-text)] [@supports(color:oklch(0_0_0))]:bg-[linear-gradient(90deg,oklch(var(--s))_4%,color-mix(in_oklch,oklch(var(--s)),oklch(var(--er)))_22%,oklch(var(--p))_45%,color-mix(in_oklch,oklch(var(--p)),oklch(var(--a)))_67%,oklch(var(--a))_100.2%)]"
                aria-hidden="true"
                data-text="Fortuna">
              </span>
              <span
                class="[&::selection]:text-base-content relative col-start-1 row-start-1 bg-[linear-gradient(90deg,theme(colors.error)_0%,theme(colors.secondary)_9%,theme(colors.secondary)_42%,theme(colors.primary)_47%,theme(colors.accent)_100%)] bg-clip-text [-webkit-text-fill-color:transparent] [&::selection]:bg-blue-700/20 [@supports(color:oklch(0_0_0))]:bg-[linear-gradient(90deg,oklch(var(--s))_4%,color-mix(in_oklch,oklch(var(--s)),oklch(var(--er)))_22%,oklch(var(--p))_45%,color-mix(in_oklch,oklch(var(--p)),oklch(var(--a)))_67%,oklch(var(--a))_100.2%)]">
                Fortuna
              </span>
            </span>
            <br />
          </h1>
          <div>
            <p class="text-base-content/70 py-4 font-medium md:text-lg xl:text-2xl">
              A open-source Bitcoin PoW smart contract on Cardano
            </p>
          </div>
          <div class="h-4" />
          <p class="md:hidden text-base-content/100 py-4 font-light md:text-lg xl:text-2xl">
            The hardfork is coming. In order to prepare for the hardfork lock your $TUNA using
            the page below. Locked $TUNA will be claimable on a new policy after the hardfork.
          </p>

          <p class="hidden md:block text-base-content/100 py-4 font-light md:text-lg xl:text-2xl">
            The hardfork is coming. In order to prepare for the hardfork<br /> lock your $TUNA using
            the page below. Locked $TUNA will<br /> be claimable on a new policy after the hardfork.
          </p>
          <div />
          <div class="h-10">
            <div
              class="inline-flex w-full flex-col items-stretch justify-center gap-2 px-4 md:flex-row xl:justify-start xl:px-0">
              <a
                data-sveltekit-preload-data
                href="/hardfork/"
                class="btn mt-5 btn-secondary md:btn-lg md:btn-wide">
                Lock my $TUNA
                <SolarArrowRightBroken />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
