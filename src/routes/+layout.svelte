<script>
  import '../app.css';
  import Navbar from '$lib/components/Navbar.svelte';
</script>

<Navbar />
<div class="bg-base-100">
  <slot />
</div>
