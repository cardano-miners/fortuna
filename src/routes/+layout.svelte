<script>
  import '../app.css';

  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  import Navbar from '$lib/components/Navbar.svelte';
  import fortunaBackground from '$lib/assets/fortuna-bg.png';
  import { createTranslucent } from '$lib/utils/provider';
  import { translucent } from '$lib/store';

  onMount(async () => {
    if (!browser) return;

    const t = await createTranslucent();

    $translucent = t;
  });
</script>

<Navbar />
<div class="bg-base-100 mx-[19vh] relative">
  <img
    src={fortunaBackground}
    alt="background"
    class="mt-6 ml-[45vw] w-[42vw] h-[42vw] absolute -z-1" />
  <div class="relative z-0">
    <slot />
  </div>
</div>
