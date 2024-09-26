<script lang="ts">
  import { V2_TUNA_POLICY_ID } from '$lib/constants';
</script>

<div class="p-10 text-base-900">
  <h1 class="text-4xl mb-4 text-primary">Mining $TUNA</h1>
  <p class="mb-4">
    The current miner is naive and a better implementation is coming soon, you can learn more <a
      href="https://github.com/aiken-lang/fortuna"
      target="_blank"
    >
      <span class="text-secondary">here</span>
    </a>
    .
  </p>

  <h2 class="text-3xl mb-2 text-primary">Requirements</h2>
  <ul class="list-disc pl-5 mb-4">
    <li>
      <a href="https://deno.land/manual@v1.36.3/getting_started/installation" target="_blank">
        <span class="text-secondary">Deno</span>
      </a>
    </li>
    <li>
      <a href="https://cardanosolutions.github.io/kupo/" target="_blank">
        <span class="text-secondary">Kupo</span>
      </a>
    </li>
    <li>
      <a href="https://github.com/CardanoSolutions/ogmios" target="_blank">
        <span class="text-secondary">Ogmios</span>
      </a>
    </li>
  </ul>
  <div role="alert" class="alert m-6">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      class="stroke-current shrink-0 w-6 h-6"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      ></path>
    </svg>
    <span>
      You can easily get access to Kupo and Ogmios with Demeter. Once you have a project in Demeter
      you can connect Ogmios and Kupo extensions for mainnet. Make sure to toggle Expose http port
      in each extensions' settings.
    </span>
  </div>
  <h2 class="text-3xl mb-2 text-primary">Environment variables</h2>
  <div class="p-4 bg-base-300 rounded-md mb-4">
    <pre><code>KUPO_URL="https://&lt;Kupo URL&gt;"
OGMIOS_URL="wss://&lt;Ogmios URL&gt;"</code></pre>
  </div>

  <h2 class="text-3xl mb-2 text-primary">Wallet</h2>
  <p class="mb-4">
    You'll need to create a wallet for the miner which can be done with the following command:
  </p>
  <div class="p-4 bg-base-300 rounded-md mb-4">
    <pre><code>deno task cli init</code></pre>
  </div>

  <h2 class="text-3xl mb-2 text-primary">Running</h2>
  <p class="mb-4">After everything is setup, you can run the miner with the following command:</p>
  <div class="p-4 bg-base-300 rounded-md mb-4">
    <pre><code>deno task cli mine</code></pre>
  </div>

  <h2 class="text-3xl mb-2 text-primary">Policy</h2>
  <p class="mb-4">
    The policy for the TUNA token is {V2_TUNA_POLICY_ID}
  </p>
</div>
