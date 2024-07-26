import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import Icons from 'unplugin-icons/vite';

export default defineConfig({
  plugins: [sveltekit(), Icons({ compiler: 'svelte' }), nodePolyfills(), wasm()],

  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },

  server: {
    fs: {
      allow: ['./'],
    },
  },

  resolve: {
    alias: {
      'uplc-node': 'uplc-web',
    },
  },

  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
      mainFields: ['browser'],
    },
    // exclude: ['@cardano-sdk/core', '@cardano-sdk/util', '@cardano-sdk/crypto']
  },
  build: {
    target: 'esnext',
    commonjsOptions: {
      dynamicRequireTargets: ['./node_modules/**/*.js'],
    },
    rollupOptions: {},
  },
  define: {
    global: {},
  },
});
