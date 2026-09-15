import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util'],
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
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
});
