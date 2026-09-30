import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [
    wasm(),
    nodePolyfills({
      include: ['crypto', 'buffer', 'stream', 'util'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  server: {
    port: 5173,
    host: true
  },
  build: {
    target: 'esnext',
    minify: false
  },
  resolve: {
    dedupe: ['@midnight-ntwrk/compact-runtime', '@midnight-ntwrk/compact-js', '@midnight-ntwrk/midnight-js-contracts'],
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
});
