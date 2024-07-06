<script lang="ts">
  import { onMount } from 'svelte';
  import { translucent, v1TunaAmount } from '$lib/store';
  import UisPadlock from '~icons/uis/padlock';
  import IonFishOutline from '~icons/ion/fish-outline';
  import MaterialSymbolsAddShoppingCartSharp from '~icons/material-symbols/add-shopping-cart-sharp';
  import { Constr, Data, fromText } from 'lucid-cardano';

  // types
  interface TimeLeft {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  }
  let timeLeft: TimeLeft;
  let lockTxHash: string | undefined;

  // parse address transactions / mint transactions or any other data to check how many tuna was sent already
  let lockedTuna = 89400;

  // unix timestamp and timer
  let targetTime = 1718719528 * 1000; // convert to milliseconds

  // get the minted %, can pass real data but a static value is ok tho
  const totalAssets = 21000000;
  const circulatingAssets = 1525600;
  const circulatingPercentage = (circulatingAssets / totalAssets) * 100;

  // minswap buy add
  let tunaMinswap =
    'https://app.minswap.org/pt-BR/swap?currencySymbolA=&tokenNameA=&currencySymbolB=279f842c33eed9054b9e3c70cd6a3b32298259c24b78b895cb41d91a&tokenNameB=54554e41';

  onMount(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const distance = targetTime - now;

      timeLeft = {
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000),
      };
    }, 1000);

    return () => clearInterval(interval);
  });

  const tunaTx = async () => {
    const hardforkHash = '';
    const tunaV1Hash = '';
    const tunaV2Hash = '';

    const tunaV2Redeem = new Constr(1, []);

    const hardforkRedeem = new Constr(1, [0n, $v1TunaAmount]);

    const lockUtxo = (await $translucent?.utxosAtWithUnit(
      '',
      hardforkHash + fromText('lock_state'),
    ))!;

    const lockDatum = Data.from(lockUtxo[0].datum!) as Constr<bigint>;
    const blockheight = lockDatum.fields[0];
    const currentLocked = lockDatum.fields[1];

    const inputUtxos = (await $translucent?.utxosAtWithUnit(
      await $translucent.wallet.address(),
      tunaV1Hash + fromText('TUNA'),
    ))!;

    const outputLockDatum = new Constr(0, [blockheight, currentLocked + $v1TunaAmount]);

    // add tuna tx logic or import a function to lock tuna here
    const lockTx = await $translucent
      ?.newTx()
      .mintAssets({ [tunaV2Hash + fromText('TUNA')]: $v1TunaAmount }, Data.to(tunaV2Redeem))
      .collectFrom(lockUtxo, '00')
      .collectFrom(inputUtxos)
      .withdraw('', 0n, Data.to(hardforkRedeem))
      .payToContract('', Data.to(outputLockDatum), { [hardforkHash + fromText('lock_state')]: 1n })
      .payToContract('', Data.to(0n), { [tunaV1Hash + fromText('TUNA')]: $v1TunaAmount })
      .complete();

    const signed = await lockTx?.sign().complete();

    await signed?.submit();

    lockTxHash = signed?.toHash();
  };
</script>

<div class="grid grid-cols-1 xl:grid-cols-2 justify-center m-4 items-center">
  <div class="card max-w-full xl:max-w-[35vw] justify-center shadow-xl mt-5 bg-base-300">
    <div class="card-body">
      <h2 class="card-title text-3xl font-bold text-white">$TUNA V1 Metrics</h2>
      <div class="grid grid-cols-1 xl:grid-cols-3 xl:grid-rows-2 gap-4 my-6">
        <div class="stat border border-base-100 border-l-8 border-l-secondary">
          <div class="stat-title">Circulating Supply</div>
          <div class="stat-value text-secondary">1.5M</div>
        </div>

        <div class="stat border border-base-100 border-l-8 border-l-red-600">
          <div class="stat-title">Max Supply</div>
          <div class="stat-value text-red-500">21M</div>
        </div>

        <div class="stat border border-base-100 border-l-8 border-l-purple-500">
          <div class="stat-title">Minted</div>
          <div class="stat-value text-purple-500">{circulatingPercentage.toFixed(2)}%</div>
        </div>

        <div class="stat border border-base-100 border-l-8 border-l-lime-300">
          <div class="stat-title">Total Locked v2</div>
          <div class="stat-value text-white items-center">
            0 <span class="text-2xl text-lime-300">$TUNA</span>
          </div>
        </div>

        <div class="stat border border-base-100 border-l-8 border-l-orange-500">
          <div class="stat-title">Locked %</div>
          <div class="stat-value text-orange-500">0%</div>
        </div>

        <div
          class="stat border border-base-100 border-l-8 border-l-green-500 row-start-1 xl:row-start-auto">
          <div class="stat-figure text-primary"></div>
          <div class="stat-title">Time left</div>

          <div class="stat-value text-white">
            {#if timeLeft && timeLeft.days !== undefined && timeLeft.hours !== undefined && timeLeft.minutes !== undefined && timeLeft.seconds !== undefined}
              <span class="countdown font-mono text-lg">
                {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s
              </span>
            {:else}
              <span class="loading loading-dots loading-xs"></span>
            {/if}
            <div class="text-sm font-light mt-2">TEST DATA ONLY</div>
          </div>
        </div>
      </div>
      <div class="card-actions justify-end"></div>
    </div>
  </div>

  <div
    class="col-start-1 row-start-1 xl:col-start-2 card max-w-full xl:min-w-[40vw] justify-center shadow-xl mt-5 bg-base-300">
    <div class="stats bg-base-300 stats-vertical lg:stats-horizontal">
      <div class="stat">
        <div class="stat-title text-success">$TUNA V1 Available</div>
        <div class="stat-figure text-primary">
          {#if $v1TunaAmount > 0}
            <button class="btn btn-md btn-success" on:click={tunaTx}
              ><UisPadlock class="text-black" />
              Lock
            </button>
          {:else}
            <button class="btn btn-md btn-warning"
              ><a href={tunaMinswap} target="_blank" class="hidden md:flex">Get v1 $TUNA</a>
              <a href={tunaMinswap} target="_blank" class="md:hidden">Buy Some</a>
              <MaterialSymbolsAddShoppingCartSharp class="text-black" /></button>
          {/if}
        </div>
        <div class="stat-value text-white">{$v1TunaAmount.toLocaleString('en-US')}</div>
        <div class="stat-actions"></div>
      </div>

      <div class="stat">
        <div class="stat-title text-success">My Locked Tuna</div>
        <div class="stat-figure text-primary">
          <IonFishOutline class="text-primary text-3xl" />
        </div>
        <div class="stat-value text-white">{lockedTuna.toLocaleString('en-US')}</div>
        <div class="stat-actions"></div>
      </div>
    </div>
  </div>
</div>
