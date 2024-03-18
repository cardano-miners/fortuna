<script lang="ts">
    import ConnectButton from "./ConnectButton.svelte";
    import fortunaLogo from '$lib/assets/fortunaLogo.png'

  </script>
  <nav class="px-6 py-3 pt-6 shadow border-b border-slate-700">
    <div class="flex flex-col container mx-auto md:flex-row md:items-center md:justify-between">
      <div class="flex justify-between items-center">
        <div>
          <a href="/"><img src={fortunaLogo} alt="logo" class="md:max-w-[200px] max-w-[20vh]"/></a>
        </div>
      </div>
      <div class="md:flex flex-col md:flex-row md:-mx-4 hidden items-center  ">
        <a href="/hardfork" class="my-1 hover:text-primary md:mx-4 md:my-0">Hardfork</a>
        <a href="/mine" class="my-1  hover:text-primary md:mx-4 md:my-0">Mine</a>
        <a href="/explorer" class="my-1  hover:text-primary md:mx-4 md:my-0">Explorer</a>
        <a href="/community" class="my-1  hover:text-primary md:mx-4 md:my-0">Community</a>
        <ConnectButton />
      </div>
    </div>
  </nav>