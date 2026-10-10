import { defineConfig } from 'vite';

// El cliente se compila a dist/web y lo sirve el mismo proceso que la API
// (ADR-011). En desarrollo, Vite reenvía /api al servidor.
export default defineConfig({
  root: 'src/web',
  publicDir: false,
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    target: 'es2022',
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': process.env.GYMTRACKER_API_URL ?? 'http://127.0.0.1:3000',
    },
  },
});
