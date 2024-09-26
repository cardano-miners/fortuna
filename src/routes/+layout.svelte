<script>
  import '../app.css';

  import Navbar from '$lib/components/Navbar.svelte';
  import fortunaBackground from '$lib/assets/fortuna-bg.png';
</script>

<Navbar />
<div class="bg-base-100 md:mx-[19vh] relative">
  <img
    src={fortunaBackground}
    alt="background"
    class="mt-6 ml-[45vw] md:w-[42vw] md:h-[42vw] w-[55vw] h-[55vw] absolute -z-1"
  />
  <div class="relative z-0">
    <slot />
  </div>
</div>
