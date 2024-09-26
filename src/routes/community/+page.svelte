<script lang="ts">
  import repositories from '$lib/data/community.json';
  import OcticonMarkGithub16 from '~icons/octicon/mark-github-16';
  import IcBaselineDiscord from '~icons/ic/baseline-discord';
  import CarbonUserAvatarFilled from '~icons/carbon/user-avatar-filled';
</script>

<div class="my-6 h-screen">
  <section class="p-6 text-center">
    <h1 class="text-5xl font-bold text-white">Welcome to the Fortuna Community!</h1>
    <p class="mt-2 text-xl"></p>
  </section>

  <section class="p-6">
    <div class="card justify-center shadow-xl mt-5 bg-base-300 p-8 md:p-4">
      <h2 class="text-3xl font-semibold text-white">Join our Discord</h2>
      <p class="my-4 md:my-2">
        Engage, collaborate, and innovate with us. Join Fortuna commmunity to create, discuss and
        use open-source tools at TxPipe server on <a
          class="link"
          href="https://discord.com/channels/946071061567529010/1146201677209292891"
          target="_blank"
        >
          Fortuna Channel
        </a>
      </p>
      <div class="mt-4 flex">
        <a href="https://discord.gg/Vc3x8N9nz2" target="_blank" class="btn-primary btn btn-sm">
          <span class="inline-block text-white font-bold rounded">Discord</span>
          <IcBaselineDiscord class="text-white text-xl" />
        </a>
        <a
          href="https://github.com/aiken-lang/fortuna"
          target="_blank"
          class="btn-primary btn btn-sm ml-4"
        >
          <span class="inline-block text-white font-bold rounded">Fortuna</span>
          <OcticonMarkGithub16 class="text-white text-xl" />
        </a>
      </div>
    </div>
  </section>

  <section class="p-6">
    <h2 class="text-3xl mb-4 font-bold text-white">Community Projects</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each repositories as repo (repo.name)}
        <div
          class="card w-full md:max-w-[25vw] justify-center shadow-xl mt-5 bg-base-300 p-4 border border-gray-700/70 hover:shadow-gray-800"
        >
          <div class="flex justify-between items-center">
            <h3 class="text-xl text-white">
              <a href={repo.repoLink} class="flex items-center gap-1 my-2">
                <OcticonMarkGithub16 class="text-white text-xl mr-2" />

                {repo.name}
              </a>
            </h3>
            <span class="badge p-4">
              <CarbonUserAvatarFilled class="text-xl text-white mr-1" />
              {repo.author}
            </span>
          </div>
          <span class="badge border border-gray-800 badge-md uppercase mt-2 badge-accent">
            {repo.category}
          </span>
          <p class="mt-2">{repo.description}</p>
          <div class="">
            <a
              href={repo.repoLink}
              class="btn btn-primary btn-ghost border border-base-100 btn-sm my-4"
            >
              <span class="inline-block text-white font-bold py-2 px-4 rounded">Repository</span>
            </a>
            {#if repo.toolLink}
              <a
                href={repo.toolLink}
                class="btn btn-primary btn-ghost border border-base-100 btn-sm my-4"
              >
                <span class="inline-block text-white font-bold py-2 px-4 rounded">Website</span>
              </a>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section class="p-6 text-center pb-[10vh]">
    <h2 class="text-4xl mb-4 font-bold text-white">Submit your project</h2>
    <p class="mb-4">Join our community of contributors and help us shape the future of Fortuna.</p>
    <a href="https://github.com/aiken-lang/fortuna" target="_blank" class="btn btn-primary">
      <span class="inline-block text-white font-bold py-2 px-4 rounded">Start Contributing</span>
    </a>
  </section>
</div>
