<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  import type { PageData } from './$types';
  import { intlFormat } from 'date-fns/intlFormat';

  export let data: PageData;

  function changePage(delta: number) {
    let newPage = parseInt($page.url.searchParams.get('page') ?? '1');

    if (isNaN(newPage) || newPage < 1) {
      newPage = 1;
    }

    newPage += delta;

    const query = new URLSearchParams($page.url.searchParams.toString());

    query.set('page', newPage.toString());

    goto(`?${query.toString()}`);
  }

  function formatHash(value: string) {
    const regex = /^0{4,}|0{4,}$/g;
    return value.replace(regex, (match) => `0<sub>${match.length}</sub> `);
  }

  function makeTarget(target_number: number, leading_zeros: number) {
    const value = target_number * 16 ** (60 - leading_zeros);

    return value.toString(16).padStart(64, '0');
  }
</script>

<div class="flex flex-col gap-12 mt-12 md:mx-0 mx-2">
  <div class="overflow-x-auto">
    <div class="table w-full text-white overflow-hidden rounded-lg shadow-lg mt-4">
      <div class="table-header-group bg-base-300">
        <div class="table-cell p-4">Block</div>
        <div class="table-cell p-4">Target</div>
        <div class="table-cell p-4">Hash</div>
        <div class="table-cell p-4">Epoch</div>
        <div class="table-cell p-4">Tx</div>
        <div class="table-cell p-4">Time</div>
      </div>

      {#each data.blocks as block (block.number)}
        <div class="table-row-group bg-base-200">
          <div class="table-cell p-4 border-t-2 border-gray-800">
            <div class="badge badge-primary">{block.number}</div>
          </div>
          <div class="table-cell p-4 border-t-2 border-gray-800">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html formatHash(makeTarget(block.targetNumber, block.leadingZeros))}
          </div>
          <div class="table-cell p-4 border-t-2 border-gray-800">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html formatHash(block.hash)}
          </div>
          <div class="table-cell p-4 border-t-2 border-gray-800">
            <div class="badge badge-success">{Math.floor(block.number / 2016 + 1)}</div>
          </div>

          <div class="table-cell p-4 border-t-2 border-gray-800">
            <a
              class="link"
              target="_blank"
              href={`https://cexplorer.io/tx/${block.cardano_tx_hash}`}
            >
              view
            </a>
          </div>

          <div class="table-cell p-4 border-t-2 border-gray-800">
            {intlFormat(block.currentPosixTime, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: 'numeric',
              second: 'numeric',
              hour12: false,
            })}
          </div>
        </div>
      {/each}
    </div>
    <div class="w-full flex justify-center mt-5">
      <div class="join">
        <button class="join-item btn" on:click={() => changePage(-1)} disabled={!data.canPrevPage}>
          «
        </button>
        <button class="join-item btn">Page {$page.url.searchParams.get('page') ?? '1'}</button>
        <button class="join-item btn" on:click={() => changePage(1)} disabled={!data.canNextPage}>
          »
        </button>
      </div>
    </div>
  </div>
</div>
