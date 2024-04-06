<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  import type { PageData } from './$types';

  export let data: PageData;

  function changePage(delta: number) {
    let newPage = parseInt($page.url.searchParams.get('page') ?? '1');

    if (isNaN(newPage) || newPage < 1) {
      newPage = 1;
    }

    newPage += delta;

    console.log(newPage);

    const query = new URLSearchParams($page.url.searchParams.toString());

    query.set('page', newPage.toString());

    goto(`?${query.toString()}`);
  }
</script>

<div class="flex flex-col gap-12 mt-12 md:mx-0 mx-2">
  <div class="flex justify-center">
    <span class="text-4xl font-semibold">Blocks ({data.totalCount})</span>
  </div>

  <div class="overflow-x-auto">
    <div class="table w-full text-white overflow-hidden rounded-lg shadow-lg mt-4">
      <div class="table-header-group bg-base-300">
        <div class="table-cell p-4">Epoch</div>
        <div class="table-cell p-4">Block</div>
        <div class="table-cell p-4">Leading Zeroes</div>
        <div class="table-cell p-4">Target</div>
        <div class="table-cell p-4">Hash</div>
        <div class="table-cell p-4">Rewards</div>
        <div class="table-cell p-4">Time</div>
      </div>

      {#each data.blocks as block (block.block_number)}
        <div class="table-row-group bg-base-200">
          <div class="table-cell p-4 border-t-2 border-gray-800">{block.epoch_time}</div>
          <div class="table-cell p-4 border-t-2 border-gray-800">
            <div class="badge badge-primary">{block.block_number}</div>
          </div>
          <div class="table-cell p-4 border-t-2 border-gray-800">{block.leading_zeros}</div>
          <div class="table-cell p-4 border-t-2 border-gray-800">
            {block.target_number}
          </div>
          <div class="table-cell p-4 border-t-2 border-gray-800">
            {block.current_hash}
          </div>
          <div class="table-cell p-4 border-t-2 border-gray-800">
            <div class="badge badge-success">{50}</div>
          </div>
          <div class="table-cell p-4 border-t-2 border-gray-800">{block.current_posix_time}</div>
        </div>
      {/each}
    </div>
    <div class="w-full flex justify-center mt-5">
      <div class="join">
        <button class="join-item btn" on:click={() => changePage(-1)} disabled={!data.canPrevPage}
          >«</button>
        <button class="join-item btn">Page {$page.url.searchParams.get('page') ?? '1'}</button>
        <button class="join-item btn" on:click={() => changePage(1)} disabled={!data.canNextPage}
          >»</button>
      </div>
    </div>
  </div>
</div>
