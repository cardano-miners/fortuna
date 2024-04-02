<script lang="ts">
  import { onMount } from 'svelte';
  import { v1TunaAmount } from '$lib/store';

  // types
  interface TimeLeft {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  }
  let timeLeft: TimeLeft;

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
    'https://app.minswap.org/pt-BR/swap?currencySymbolA=&tokenNameA=&currencySymbolB=279f842c33eed9054b9e3c70cd6a3b32298259c24b78b895cb41d91a&token';

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

  const tunaTx = () => {
    // add tuna tx logic or import a function to lock tuna here
    alert('Locking Tuna');
  };
</script>

<div class="grid grid-cols-2 justify-center m-4 items-center">
  <div class="card max-w-[35vw] justify-center shadow-xl mt-5 bg-base-300">
    <div class="card-body">
      <h2 class="card-title text-3xl font-bold text-white">$TUNA V1 Metrics</h2>
      <div class="grid grid-cols-3 grid-rows-2 gap-4 my-6">
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

        <div class="stat border border-base-100 border-l-8 border-l-green-500">
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

  <div class="card max-w-[35vw] justify-center shadow-xl mt-5 bg-base-300">
    <div class="stats bg-base-300">
      <div class="stat">
        <div class="stat-title text-success">$TUNA V1 Available</div>
        <div class="stat-figure text-primary">
          {#if $v1TunaAmount > 0}
            <button class="btn btn-md btn-success" on:click={tunaTx}
              ><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
                ><path
                  fill="currentColor"
                  d="M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12m10-5a1 1 0 0 1 1 1v3h3a1 1 0 1 1 0 2h-3v3a1 1 0 1 1-2 0v-3H8a1 1 0 1 1 0-2h3V8a1 1 0 0 1 1-1" /></svg>
              Lock
            </button>
          {:else}
            <button class="btn btn-md btn-warning"
              ><a href={tunaMinswap} target="_blank">Get some v1 $TUNA</a>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="text-black"
                width="23"
                height="20"
                viewBox="0 0 576 512"
                ><path
                  fill="currentColor"
                  d="M0 24C0 10.7 10.7 0 24 0h45.5c22 0 41.5 12.8 50.6 32h411c26.3 0 45.5 25 38.6 50.4l-41 152.3c-8.5 31.4-37 53.3-69.5 53.3H170.7l5.4 28.5c2.2 11.3 12.1 19.5 23.6 19.5H488c13.3 0 24 10.7 24 24s-10.7 24-24 24H199.7c-34.6 0-64.3-24.6-70.7-58.5l-51.6-271c-.7-3.8-4-6.5-7.9-6.5H24C10.7 48 0 37.3 0 24m128 440a48 48 0 1 1 96 0a48 48 0 1 1-96 0m336-48a48 48 0 1 1 0 96a48 48 0 1 1 0-96M252 160c0 11 9 20 20 20h44v44c0 11 9 20 20 20s20-9 20-20v-44h44c11 0 20-9 20-20s-9-20-20-20h-44V96c0-11-9-20-20-20s-20 9-20 20v44h-44c-11 0-20 9-20 20" /></svg
              ></button>
          {/if}
        </div>
        <div class="stat-value text-white">{$v1TunaAmount.toLocaleString('en-US')}</div>
        <div class="stat-actions"></div>
      </div>

      <div class="stat">
        <div class="stat-title text-success">My Locked Tuna</div>
        <div class="stat-figure text-primary">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            class="inline-block w-8 h-8 stroke-current"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            ></path
            ></svg>
        </div>
        <div class="stat-value">{lockedTuna.toLocaleString('en-US')}</div>
        <div class="stat-actions"></div>
      </div>
    </div>
  </div>
</div>
