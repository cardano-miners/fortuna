import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import Icons from 'unplugin-icons/vite';

export default defineConfig({
  plugins: [sveltekit(), Icons({ compiler: 'svelte' }), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      '@dcspark/cardano-multiplatform-lib-nodejs': '@dcspark/cardano-multiplatform-lib-browser',
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
});
