<script lang="ts">
  import repositories from '$lib/data/community.json';
</script>

<div class="my-6 h-screen">
  <section class="p-6 text-center">
    <h1 class="text-6xl font-bold">Welcome to the Fortuna Community!</h1>
    <p class="mt-2 text-xl"></p>
  </section>

  <section class="p-6">
    <div class="card justify-center shadow-xl mt-5 bg-base-300 p-4">
      <h2 class="text-2xl">Join our Discord</h2>
      <p class="mt-2">
        Engage, collaborate, and innovate with us. Join Fortuna commmunity to create, discuss and
        use open-source tools at TxPipe server on <a
          class="link"
          href="https://discord.com/channels/946071061567529010/1146201677209292891"
          target="_blank">Fortuna channel</a>
      </p>
      <div class="mt-4">
        <button class=" btn-primary btn btn-sm">
          <a
            href="https://discord.gg/Vc3x8N9nz2"
            target="_blank"
            class=" inline-block text-white font-bold rounded">Server Link</a>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
            ><path
              fill="currentColor"
              class="text-white"
              d="M14.82 4.26a10.14 10.14 0 0 0-.53 1.1a14.66 14.66 0 0 0-4.58 0a10.14 10.14 0 0 0-.53-1.1a16 16 0 0 0-4.13 1.3a17.33 17.33 0 0 0-3 11.59a16.6 16.6 0 0 0 5.07 2.59A12.89 12.89 0 0 0 8.23 18a9.65 9.65 0 0 1-1.71-.83a3.39 3.39 0 0 0 .42-.33a11.66 11.66 0 0 0 10.12 0q.21.18.42.33a10.84 10.84 0 0 1-1.71.84a12.41 12.41 0 0 0 1.08 1.78a16.44 16.44 0 0 0 5.06-2.59a17.22 17.22 0 0 0-3-11.59a16.09 16.09 0 0 0-4.09-1.35M8.68 14.81a1.94 1.94 0 0 1-1.8-2a1.93 1.93 0 0 1 1.8-2a1.93 1.93 0 0 1 1.8 2a1.93 1.93 0 0 1-1.8 2m6.64 0a1.94 1.94 0 0 1-1.8-2a1.93 1.93 0 0 1 1.8-2a1.92 1.92 0 0 1 1.8 2a1.92 1.92 0 0 1-1.8 2" /></svg>
        </button>
        <button class="btn-primary btn btn-sm ml-4"
          ><a
            href="https://github.com/aiken-lang/fortuna"
            target="_blank"
            class="inline-block text-white font-bold rounded">Fortuna Github</a>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
            ><path
              fill="currentColor"
              fill-rule="evenodd"
              class="text-white"
              d="M12.006 2a9.847 9.847 0 0 0-6.484 2.44a10.32 10.32 0 0 0-3.393 6.17a10.48 10.48 0 0 0 1.317 6.955a10.045 10.045 0 0 0 5.4 4.418c.504.095.683-.223.683-.494c0-.245-.01-1.052-.014-1.908c-2.78.62-3.366-1.21-3.366-1.21a2.711 2.711 0 0 0-1.11-1.5c-.907-.637.07-.621.07-.621c.317.044.62.163.885.346c.266.183.487.426.647.71c.135.253.318.476.538.655a2.079 2.079 0 0 0 2.37.196c.045-.52.27-1.006.635-1.37c-2.219-.259-4.554-1.138-4.554-5.07a4.022 4.022 0 0 1 1.031-2.75a3.77 3.77 0 0 1 .096-2.713s.839-.275 2.749 1.05a9.26 9.26 0 0 1 5.004 0c1.906-1.325 2.74-1.05 2.74-1.05c.37.858.406 1.828.101 2.713a4.017 4.017 0 0 1 1.029 2.75c0 3.939-2.339 4.805-4.564 5.058a2.471 2.471 0 0 1 .679 1.897c0 1.372-.012 2.477-.012 2.814c0 .272.18.592.687.492a10.05 10.05 0 0 0 5.388-4.421a10.473 10.473 0 0 0 1.313-6.948a10.32 10.32 0 0 0-3.39-6.165A9.847 9.847 0 0 0 12.007 2Z"
              clip-rule="evenodd" /></svg>
        </button>
      </div>
    </div>
  </section>

  <section class="p-6">
    <h2 class="text-3xl mb-4">Community Projects</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each repositories as repo (repo.name)}
        <div
          class="card max-w-[25vw] justify-center shadow-xl mt-5 bg-base-300 p-4 border border-gray-800">
          <div class="flex justify-between items-center">
            <h3 class="text-xl text-secondary">
              <a href={repo.repoLink} class="flex items-center gap-1 my-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33c.85 0 1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2" />
                </svg>
                {repo.name}
              </a>
            </h3>
            <span class="badge p-4">Created by: {repo.author}</span>
          </div>
          <span class="badge border border-gray-800 badge-md uppercase">{repo.category}</span>
          <p class="mt-2">{repo.description}</p>
          <div class="">
            <button class="btn btn-primary btn-ghost border border-base-100 btn-sm my-4">
              <a href={repo.repoLink} class="inline-block text-white font-bold py-2 px-4 rounded"
                >View Repository</a
              ></button>
            {#if repo.toolLink}
              <button class="btn btn-primary btn-ghost border border-base-100 btn-sm my-4">
                <a href={repo.toolLink} class="inline-block text-white font-bold py-2 px-4 rounded"
                  >Website</a
                ></button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section class="p-6 text-center pb-[10vh]">
    <h2 class="text-4xl mb-4 font-bold">Submit your project</h2>
    <p class="mb-4">Join our community of contributors and help us shape the future of Fortuna.</p>
    <button class="btn btn-primary"
      ><a
        href="https://github.com/aiken-lang/fortuna"
        target="_blank"
        class="inline-block text-white font-bold py-2 px-4 rounded">Start Contributing</a>
    </button>
  </section>
</div>
