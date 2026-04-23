import { defineConfig } from 'vitest/config';
import path from 'node:path';

// This root config ensures that aliases and monorepo resolution work correctly
// even when running Vitest from the root directory targeting specific package files.
export default defineConfig({
  test: {
    testTimeout: 20000,
    globals: true,
    environment: 'node',
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/']
    }
  },
  resolve: {
    alias: {
      // Direct alias for the E2E fixture modules
      '@modules': path.resolve(__dirname, 'packages/core/tests/fixtures/basic-app/src/modules'),
      '@config': path.resolve(__dirname, 'packages/core/tests/fixtures/basic-app/src/config'),
      '@middleware': path.resolve(__dirname, 'packages/core/tests/fixtures/basic-app/src/middleware')
    },
    extensions: ['.ts', '.js', '.mts', '.mjs', '.json']
  }
});
