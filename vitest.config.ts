import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    alias: {
      '@modules': path.resolve(__dirname, 'tests/fixtures/basic-app/src/modules'),
      '@config': path.resolve(__dirname, 'tests/fixtures/basic-app/src/config'),
      '@middleware': path.resolve(__dirname, 'tests/fixtures/basic-app/src/middleware')
    }
  }
});
