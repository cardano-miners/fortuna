<script lang="ts">
  import LatestBlocks from '$lib/components/charts/LatestBlocks.json';
  import { format, differenceInMinutes } from 'date-fns';
  import SparklineChart from './charts/SparklineChart.svelte';

  // import MaterialSymbolsLightBolt as liveIcon from '~icons/material-symbols-light/bolt'
  let liveIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" class="mr-1" width="15" height="15" viewBox="0 0 24 24"><path fill="currentColor" d="m9.154 20.885l1-6.885h-4.25l7.48-10.788h.462L12.866 11h5l-8.25 9.885z"/></svg>`;
  // import import Carbon3dSoftware as blockIcon from '~icons/carbon/3d-software'
  let blockIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" class="text-white" width="42" height="42" viewBox="0 0 32 32"><path d="M21.49 13.115l-9-5a1 1 0 0 0-1 0l-9 5A1.008 1.008 0 0 0 2 14v9.995a1 1 0 0 0 .52.87l9 5A1.004 1.004 0 0 0 12 30a1.056 1.056 0 0 0 .49-.135l9-5A.992.992 0 0 0 22 24V14a1.008 1.008 0 0 0-.51-.885zM11 27.295l-7-3.89v-7.72l7 3.89zm1-9.45L5.06 14L12 10.135l6.94 3.86zm8 5.56l-7 3.89v-7.72l7-3.89z" fill="currentColor"/><path d="M30 6h-4V2h-2v4h-4v2h4v4h2V8h4V6z" fill="currentColor"/></svg>`;
  // import import MdiArrowTopRightBoldBoxOutline as linkIcon from '~icons/mdi/arrow-top-right-bold-box-outline'
  let linkIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M16 8v7.1L13.9 13l-4.1 3.9L7 14l4.1-3.9L8.9 8zM3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2m2 0h14v14H5z"/></svg>
`;
  // import import TdesignBlockchain as poolIcon from '~icons/tdesign/blockchain'
  let poolIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M2 2h7v2.5h6V2h7v7h-2.5v6H22v7h-7v-2.5H9V22H2v-7h2.5V9H2zm5 5V4H4v3zm-.5 2v6H9v2.5h6V15h2.5V9H15V6.5H9V9zM17 17v3h3v-3zM7 17H4v3h3zM17 4v3h3V4z"/></svg>`;

  // import import MaterialSymbolsDeployedCodeAccount as soloIcon from '~icons/material-symbols/deployed-code-account'
  let soloIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M17 21.025q-.2 0-.4-.05t-.375-.175l-3-1.75q-.35-.2-.537-.537t-.188-.738V14.25q0-.4.188-.737t.537-.538l3-1.75q.175-.125.375-.175T17 11q.2 0 .388.063t.362.162l3 1.75q.35.2.55.538t.2.737v3.525q0 .4-.2.738t-.55.537l-3 1.75q-.175.1-.363.163t-.387.062M2 20v-2.8q0-.825.425-1.55t1.175-1.1q1.275-.65 2.875-1.1T10 13h.35q.15 0 .3.05q-.725 1.8-.6 3.575T11.25 20zm8-8q-1.65 0-2.825-1.175T6 8q0-1.65 1.175-2.825T10 4q1.65 0 2.825 1.175T14 8q0 1.65-1.175 2.825T10 12m4.65 1.85L17 15.225l2.35-1.375L17 12.5zm3.1 5.2l2.25-1.3V15l-2.25 1.325zM14 17.75l2.25 1.325V16.35L14 15.025z"/></svg>`;
</script>

<div class="flex gap-4">
  <div class="card bg-base-300 w-[100vh] h-[45vh] p-4">
    <div class="card-title">$TUNA Market</div>

    <div class="card-body">
      <div class="grid grid-cols-4 grid-rows-2 gap-2">
        <div class="col-start-1">
          <div class="flex-row">
            <span class="text-sm font-light">Circulating Supply</span><br />
            <span class="text-3xl font-bold text-primary"
              >◎ 1.5<span class="text-primary/40">M</span></span
            ><br />
            <span class="text-sm font-light">of 21M: </span><span
              class="text-sm font-light text-primary">
              7.6%</span>
          </div>
        </div>
        <div class="col-start-1 border-t-2 border-primary pt-2">
          <div class="flex-row">
            <span class="text-sm font-light">Volume 24h</span><br />
            <span class="text-3xl font-bold text-primary">452.00 ₳</span><br />
            <span class="text-sm font-light">Total Liquidity: </span><span
              class="text-sm font-light text-primary">
              6K ₳</span>
          </div>
        </div>
        <div class=" col-start-2 col-end-4 row-start-1">
          <div class="flex justify-between items-center">
            <div>
              <span class="text-sm font-light">TUNA Price</span><br />
              <span class="text-6xl font-bold text-primary">0,0905 ₳</span><br />
              <span class="text-sm font-light">Price change: </span><span
                class="text-sm font-light text-success">↑ 3,00%</span>
            </div>
            <div>
              <span class="text-sm font-light"
                >Holders: <span class="font-semibold text-primary">999</span></span
              ><br />
              <span class="text-sm font-light"
                ><span class="font-semibold text-primary">1</span> ADA:
                <span class="font-semibold text-primary">11.04 TUNA</span></span>
            </div>
          </div>
        </div>
        <div class=" col-start-2 col-end-4 row-start-2">
          <SparklineChart />
        </div>
      </div>
    </div>
  </div>

  <div class="card bg-base-300 w-[70vh] h-[45vh] p-4">
    <div class="card-title mb-4">
      Latest Blocks<span class="badge badge-success text-white">{@html liveIcon} LIVE</span>
    </div>
    <div class="overflow-y-auto hide-scrollbar">
      {#each LatestBlocks as data (data.blockNumber)}
        <div class="flex">
          <div class="card bg-base-100 w-full m-2">
            <div class="flex items-center m-2">
              <div>{@html blockIcon}</div>
              <div>
                <div
                  class="tooltip"
                  data-tip="012366e8bdd0fe504d56c00f0fd7fd29f843ed2c69eeeb754a77acf">
                  <div class="text-2xl font-semibold ml-2 text-accent">{data.blockNumber}</div>
                </div>
                <div
                  class="tooltip"
                  data-tip={format(new Date(data.blockTime), "dd/MM/yyyy 'at' hh:mm a")}>
                  <div class="badge badge-neutral ml-2">
                    {differenceInMinutes(new Date(), new Date(data.blockTime))} minutes ago
                  </div>
                  <div class="badge badge-warning">
                    +{data.minted} $TUNA
                  </div>
                </div>
              </div>
              <div class="ml-auto text-right">
                <div class="text-lg font-semibold flex">
                  <a href="https://cardanoscan.io/transaction/{data.mintTx}" target="_blank">
                    <span class="link link-primary link-hover flex">
                      {data.mintTx.slice(0, 4)}...{data.mintTx.slice(-8)}<span class="ml-2"
                        >{@html linkIcon}</span>
                    </span>
                  </a>
                </div>
                {#if data.isPool}
                  <div class="tooltip" data-tip="Minted by a Pool">
                    <div class="badge badge-accent">
                      {@html poolIcon}<span class="ml-1">{data.poolTicker}</span>
                    </div>
                  </div>
                {:else}
                  <div class="tooltip" data-tip="Minted by a single Miner">
                    <div class="badge badge-secondary">
                      {@html soloIcon}
                      <span class="ml-1"> {data.miner.slice(0, 5)}...{data.miner.slice(-4)}</span>
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
