<script lang="ts">

</script>

<div>
  <div
    class="flex min-h-[550vh] max-w-[100vw] flex-col items-center justify-start xl:flex-row xl:items-start xl:justify-between">
    <div class="shrink xl:w-1/2">
      <div
        class="flex min-h-[calc(100vh-4rem)] items-center justify-center px-2 py-10 text-center xl:justify-start xl:pe-0 xl:ps-10 xl:text-start">
        <div>
          <h1
            class="font-title xl:w-[115%] xl:text-start text-center text-[clamp(2rem,6vw,4.2rem)] font-black leading-[1.1] [word-break:auto-phrase] [:root[dir=rtl]_&]:leading-[1.35]">
            <span
              class="[&::selection]:text-base-content brightness-150 contrast-150 [&::selection]:bg-blue-700/20">
              Fortuna is a
            </span>
            <br />
            <span class="inline-grid">
              <span
                class="pointer-events-none col-start-1 row-start-1 bg-[linear-gradient(90deg,theme(colors.error)_0%,theme(colors.secondary)_9%,theme(colors.secondary)_42%,theme(colors.primary)_47%,theme(colors.accent)_100%)] bg-clip-text blur-xl [-webkit-text-fill-color:transparent] [transform:translate3d(0,0,0)] before:content-[attr(data-text)] [@supports(color:oklch(0_0_0))]:bg-[linear-gradient(90deg,oklch(var(--s))_4%,color-mix(in_oklch,oklch(var(--s)),oklch(var(--er)))_22%,oklch(var(--p))_45%,color-mix(in_oklch,oklch(var(--p)),oklch(var(--a)))_67%,oklch(var(--a))_100.2%)]"
                aria-hidden="true"
                data-text="Bitcoin PoW">
              </span>
              <span
                class="[&::selection]:text-base-content relative col-start-1 row-start-1 bg-[linear-gradient(90deg,theme(colors.error)_0%,theme(colors.secondary)_9%,theme(colors.secondary)_42%,theme(colors.primary)_47%,theme(colors.accent)_100%)] bg-clip-text [-webkit-text-fill-color:transparent] [&::selection]:bg-blue-700/20 [@supports(color:oklch(0_0_0))]:bg-[linear-gradient(90deg,oklch(var(--s))_4%,color-mix(in_oklch,oklch(var(--s)),oklch(var(--er)))_22%,oklch(var(--p))_45%,color-mix(in_oklch,oklch(var(--p)),oklch(var(--a)))_67%,oklch(var(--a))_100.2%)]">
                Bitcoin PoW
              </span>
            </span>
            <br />
            <span
              class="[&::selection]:text-base-content brightness-150 contrast-150 [&::selection]:bg-blue-700/20">
              Smart Contract
            </span>
          </h1>
          <div class="h-4" />
          <p class="text-base-content/70 font-title py-4 font-light md:text-lg xl:text-2xl">
            The hardfork is coming. In order to prepare for the hardfork<br /> lock your $TUNA by
            clicking this button. Locked $TUNA will<br /> be claimable on a new policy after the hardfork.
          </p>
          <div class="h-10" />
          <div>
            <div
              class="inline-flex w-full flex-col items-stretch justify-center gap-2 px-4 md:flex-row xl:justify-start xl:px-0">
              <a
                data-sveltekit-preload-data
                href="/mine/"
                class="btn md:btn-lg md:btn-wide group rounded-full px-12">
                Mine
              </a>
              <a
                data-sveltekit-preload-data
                href="/hardfork/"
                class="btn btn-neutral md:btn-lg md:btn-wide group rounded-full px-12">
                Hardfork
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.5"
                  stroke="currentColor"
                  class="hidden h-6 w-6 transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1 md:inline-block">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
