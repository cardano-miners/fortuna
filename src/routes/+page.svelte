<script lang="ts">
  import SolarArrowRightBroken from '~icons/solar/arrow-right-broken';
</script>

<div class="">
  <div
    class="flex max-w-[100vw] flex-col items-center justify-start xl:flex-row xl:items-start xl:justify-between"
  >
    <div class="shrink xl:w-1/2">
      <div class="flex mt-[5vw] justify-center px-2 text-center xl:justify-start xl:text-start">
        <div class="py-5 mx-5">
          <h1
            class="font-title xl:w-[115%] xl:text-start text-center text-[clamp(4rem,6vw,4.2rem)] font-black leading-[1.1] [word-break:auto-phrase] [:root[dir=rtl]_&]:leading-[1.35]"
          >
            <span
              class="[&::selection]:text-base-content brightness-150 contrast-150 [&::selection]:bg-blue-700/20"
            >
              Welcome to
            </span>
            <br />
            <span class="inline-grid">
              <span
                class="pointer-events-none col-start-1 row-start-1 bg-[linear-gradient(90deg,theme(colors.error)_0%,theme(colors.secondary)_9%,theme(colors.secondary)_42%,theme(colors.primary)_47%,theme(colors.accent)_100%)] bg-clip-text blur-xl [-webkit-text-fill-color:transparent] [transform:translate3d(0,0,0)] before:content-[attr(data-text)] [@supports(color:oklch(0_0_0))]:bg-[linear-gradient(90deg,oklch(var(--s))_4%,color-mix(in_oklch,oklch(var(--s)),oklch(var(--er)))_22%,oklch(var(--p))_45%,color-mix(in_oklch,oklch(var(--p)),oklch(var(--a)))_67%,oklch(var(--a))_100.2%)]"
                aria-hidden="true"
                data-text="Fortuna"
              ></span>
              <span
                class="[&::selection]:text-base-content relative col-start-1 row-start-1 bg-[linear-gradient(90deg,theme(colors.error)_0%,theme(colors.secondary)_9%,theme(colors.secondary)_42%,theme(colors.primary)_47%,theme(colors.accent)_100%)] bg-clip-text [-webkit-text-fill-color:transparent] [&::selection]:bg-blue-700/20 [@supports(color:oklch(0_0_0))]:bg-[linear-gradient(90deg,oklch(var(--s))_4%,color-mix(in_oklch,oklch(var(--s)),oklch(var(--er)))_22%,oklch(var(--p))_45%,color-mix(in_oklch,oklch(var(--p)),oklch(var(--a)))_67%,oklch(var(--a))_100.2%)]"
              >
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
          <div class="h-4"></div>
          <p class="md:hidden text-base-content/100 py-4 font-light md:text-lg xl:text-2xl">
            The hardfork is coming. In order to prepare for the hardfork lock your $TUNA using the
            page below. Locked $TUNA will be claimable on a new policy after the hardfork.
          </p>

          <p class="hidden md:block text-base-content/100 py-4 font-light md:text-lg xl:text-2xl">
            The hardfork is coming. In order to prepare for the hardfork
            <br />
            lock your $TUNA using the page below. Locked $TUNA will
            <br />
            be claimable on a new policy after the hardfork.
          </p>
          <div></div>
          <div class="h-10">
            <div
              class="inline-flex w-full flex-col items-stretch justify-center gap-2 px-4 md:flex-row xl:justify-start xl:px-0"
            >
              <a
                data-sveltekit-preload-data
                href="/hardfork/"
                class="btn mt-5 btn-secondary md:btn-lg md:btn-wide"
              >
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
