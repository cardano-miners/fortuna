<script lang="ts">
  import LatestBlocks from '$lib/components/charts/LatestBlocks.json';
  import { format, differenceInMinutes } from 'date-fns';
  // icons
  import BxCommentError from '~icons/bx/comment-error';
  import MaterialSymbolsFitbitArrowUpward from '~icons/material-symbols/fitbit-arrow-upward';
  import MaterialSymbolsFitbitArrowDownwardSharp from '~icons/material-symbols/fitbit-arrow-downward-sharp';

  import SparklineChart from './charts/SparklineChart.svelte';

  export let marketData: any = [];

  let priceUp: boolean = true;

  // marketData should return information to be displayed not only in sparkline chart
  // but also inside the card with the market information as marketData.supply marketData.volume etc
</script>

<div role="alert" class="alert alert-error my-6">
  <BxCommentError class="shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24" />
  <span>
    WARNING: The explorer is under construction and the data here is not accurate or real for now.
  </span>
</div>

<div class="flex flex-col md:flex-row gap-4">
  <div class="card bg-base-300 w-full md:w-[100vh] md:h-[45vh] p-4">
    <div class="card-title">$TUNA Market</div>
    <div class="card-body">
      <div class="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-2">
        <div class="col-start-1">
          <div class="flex-row">
            <span class="text-sm font-light">Circulating Supply</span>
            <br />
            <span class="text-3xl font-bold text-primary">
              🐟 1.5
              <span class="text-primary/40">M</span>
            </span>
            <br />
            <span class="text-sm font-light">of 21M:</span>
            <span class="text-sm font-light text-primary">7.6%</span>
          </div>
        </div>
        <div
          class="md:col-start-1 border-y-2 md:border-t-2 md:border-y-0 border-primary pt-2 py-5 md:py-0"
        >
          <div class="flex-row">
            <span class="text-sm font-light">Volume 24h</span>
            <br />
            <span class="text-3xl font-bold text-primary">
              452.00 <span class="text-primary/50">₳</span>
            </span>
            <br />
            <span class="text-sm font-light">Total Liquidity:</span>
            <span class="text-sm font-light text-primary">6K ₳</span>
          </div>
        </div>
        <div class=" md:col-start-2 md:col-end-5 md:row-start-1">
          <div class="md:flex justify-between items-center">
            <div>
              <span class="text-sm font-light">TUNA Price</span>
              <br />
              <span class="md:text-6xl text-5xl font-bold text-primary">
                0,0905 <span class="text-primary/70 font-medium">₳</span>
              </span>
              <br />
              <div class="flex items-center">
                <span class="text-sm font-light">Price change:</span>
                {#if priceUp}<span class="text-sm font-light text-success flex items-center">
                    <MaterialSymbolsFitbitArrowUpward class="size-6" /> 3,00%
                  </span>
                {:else}
                  <span class="text-sm font-light text-error flex items-center">
                    <MaterialSymbolsFitbitArrowDownwardSharp class="size-6" /> 3,00%
                  </span>
                {/if}
              </div>
            </div>
            <div>
              <span class="text-sm font-light">
                Holders: <span class="font-semibold text-primary">999</span>
              </span>
              <br />
              <span class="text-sm font-light">
                <span class="font-semibold text-primary">1</span>
                ADA:
                <span class="font-semibold text-primary">11.04 TUNA</span>
              </span>
            </div>
          </div>
        </div>
        <div class="md:col-start-2 md:col-end-5 md:row-start-2 pt-2">
          <SparklineChart data={marketData} />
        </div>
      </div>
    </div>
  </div>
</div>
