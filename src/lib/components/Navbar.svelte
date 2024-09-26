<script lang="ts">
  import { page } from '$app/stores';
  import fortunaLogo from '$lib/assets/fortunaLogo.png';
  import ConnectButton from './ConnectButton.svelte';
  import MdiDiscord from '~icons/mdi/discord';
  import MdiGithubBox from '~icons/mdi/github-box';
</script>

<nav class="px-6 py-3 pt-6 shadow border-b border-slate-700">
  <div class="drawer">
    <input id="my-drawer" type="checkbox" class="drawer-toggle" />
    <div
      class="drawer-content flex flex-col flex-wrap container mx-auto md:flex-row md:items-center md:justify-between"
    >
      <div class="flex flex-row flex-wrap justify-between md:hidden">
        <label for="my-drawer" aria-label="open sidebar" class="btn btn-square btn-ghost">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            class="inline-block w-6 h-6 stroke-current"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6h16M4 12h16M4 18h16"
            ></path>
          </svg>
        </label>
        <div class="md:hidden">
          <ConnectButton />
        </div>
      </div>

      <div class="flex justify-between items-center">
        <div class="hidden md:block">
          <a href="/"><img src={fortunaLogo} alt="logo" class="md:max-w-[200px] max-w-[20vh]" /></a>
        </div>
      </div>

      <div
        class="md:flex flex-col md:flex-row hidden items-center font-medium text-white gap-y-1 md:gap-x-4 md:gap-y-0"
      >
        <a
          href="/hardfork"
          class="hover:text-primary hover:border-primary"
          class:border-b-2={$page.url.pathname === '/hardfork'}
          class:border-secondary={$page.url.pathname === '/hardfork'}
        >
          Hardfork
        </a>

        <a
          href="/mine"
          class="hover:text-primary hover:border-primary"
          class:border-b-2={$page.url.pathname === '/mine'}
          class:border-secondary={$page.url.pathname === '/mine'}
        >
          Mine
        </a>

        <a
          href="/explorer"
          class="hover:text-primary hover:border-primary"
          class:border-b-2={$page.url.pathname === '/explorer'}
          class:border-secondary={$page.url.pathname === '/explorer'}
        >
          Explorer
        </a>

        <a
          href="/community"
          class="hover:text-primary hover:border-primary"
          class:border-b-2={$page.url.pathname === '/community'}
          class:border-secondary={$page.url.pathname === '/community'}
        >
          Community
        </a>
      </div>

      <div class="md:flex flex-row -mx-2 items-center gap-6 hidden">
        <a href="https://github.com/cardano-miners/fortuna" target="_blank">
          <MdiGithubBox class="size-9 hover:text-primary " />
        </a>
        <a href="https://discord.gg/Vc3x8N9nz2" target="_blank">
          <MdiDiscord class="size-7 hover:text-primary" />
        </a>
        <ConnectButton />
      </div>
    </div>
    <div class="drawer-side">
      <label for="my-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
      <ul class="menu p-4 w-80 min-h-full bg-base-200 text-xl gap-4 pt-10">
        <a href="/"><img src={fortunaLogo} alt="logo" class="md:max-w-[200px] max-w-[20vh]" /></a>
        <div class="flex flex-col gap-6 mt-6">
          <a
            href="/hardfork"
            class="hover:text-primary hover:border-primary"
            class:border-b-2={$page.url.pathname === '/hardfork'}
            class:border-base={$page.url.pathname === '/hardfork'}
          >
            Hardfork <span class="badge badge-accent">TUNA V2</span>
          </a>

          <a
            href="/mine"
            class="hover:text-primary hover:border-primary"
            class:border-b-2={$page.url.pathname === '/mine'}
            class:border-base={$page.url.pathname === '/mine'}
          >
            Mine
          </a>

          <a
            href="/explorer"
            class="hover:text-primary hover:border-primary"
            class:border-b-2={$page.url.pathname === '/explorer'}
            class:border-base={$page.url.pathname === '/explorer'}
          >
            Explorer
          </a>

          <a
            href="/community"
            class="hover:text-primary hover:border-primary"
            class:border-b-2={$page.url.pathname === '/community'}
            class:border-base={$page.url.pathname === '/community'}
          >
            Community
          </a>
        </div>
        <div class="flex flex-row items-center gap-4 mt-4">
          <a href="https://github.com/aiken-lang/fortuna" target="_blank" class="">
            <MdiGithubBox class="size-10 text-primary " />
          </a>
          <a href="https://discord.gg/Vc3x8N9nz2" target="_blank" class="">
            <MdiDiscord class="size-8 text-primary" />
          </a>
        </div>
      </ul>
    </div>
  </div>
</nav>

<style>
  .drawer-side {
    z-index: 1000; /* adjust this value as needed */
  }
</style>
