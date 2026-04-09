import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    testTimeout: 15000,      // Integrations tests with filesystem can be slow in CI
    pool: 'forks',           // True isolation for process.cwd() spies across suites
    // coverage: {
    //   provider: 'v8',
    //   reporter: ['text', 'json', 'html'],
    //   exclude: ['tests/**', 'dist/**']
    // },
    alias: {
      '@modules': path.resolve(__dirname, 'tests/fixtures/basic-app/src/modules'),
      '@config': path.resolve(__dirname, 'tests/fixtures/basic-app/src/config'),
      '@middleware': path.resolve(__dirname, 'tests/fixtures/basic-app/src/middleware')
    }
  }
});
