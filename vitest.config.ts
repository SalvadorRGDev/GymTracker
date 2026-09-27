import { defineConfig } from 'vitest/config';

// Un solo corredor para dominio, servidor y cliente (ADR-004). Nada de lo que
// corre aquí necesita servicios externos: el almacén es un directorio temporal.
export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'servidor',
          include: ['src/**/*.test.ts'],
          exclude: ['src/web/**'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'cliente',
          include: ['src/web/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
    ],
  },
});
