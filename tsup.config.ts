import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node18',
  },
  {
    entry: ['src/cli/index.ts'],
    format: ['esm'],
    dts: true,
    outDir: 'dist/cli',
    sourcemap: true,
    target: 'node18',
  }
]);
