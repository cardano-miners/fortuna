<script>
  import '../app.css';
  import Navbar from '$lib/components/Navbar.svelte';
  import fortunaBackground from '$lib/assets/fortuna-bg.png';
</script>

<Navbar />
<div class="bg-base-100 mx-[19vh] relative">
  <img src={fortunaBackground} alt="background" class="mt-5 ml-[45vw] w-[42vw] h-[42vw] absolute z-0" />
  <div class="relative z-10">
  <slot />
</div>
</div>
