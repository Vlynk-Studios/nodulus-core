import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from '../../src/bootstrap/createApp.js';
import { registry } from '../../src/core/registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceUrl = pathToFileURL(path.resolve(__dirname, '../../src/index.ts')).href;

// Because we test inside Vitest with dynamic physical files, we need to import from the source files directly.
// Luckily vitest/tsm handles dynamic TS imports automatically!
const runInTmpApp = async (files: Record<string, string>, tests: (tmpDir: string, app: any) => Promise<void>) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-app-test-'));
  
  for (const [name, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const finalContent = content.replace(/\{\{SOURCE\}\}/g, sourceUrl);
    fs.writeFileSync(fullPath, finalContent);
  }
  
  const mockApp = {
    use: vi.fn(),
  };

  const originalCwd = process.cwd();
  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

  try {
    registry.clearRegistry();
    await tests(tmpDir, mockApp);
  } finally {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

describe('Core: createApp Integration V0.5.0', () => {
  afterEach(() => {
    registry.clearRegistry();
    vi.restoreAllMocks();
  });

  const validAppStructure = {
    'nodulus.config.js': `
      export default { prefix: '/api', strict: false };
    `,
    'src/modules/users/index.ts': `
      import { Module } from '{{SOURCE}}';
      Module('users');
    `,
    'src/modules/users/controller.ts': `
      import { Controller } from '{{SOURCE}}';
      Controller('UsersController', { prefix: '/users' });
      const fakeRouter = function() {};
      fakeRouter.use = function() {};
      fakeRouter.stack = [
        { route: { path: '/me', methods: { get: true } } }
      ];
      export default fakeRouter;
    `
  };

  it('should mount discovered routes and return NodulusApp shape', async () => {
    await runInTmpApp(validAppStructure, async (_, app) => {
      const nodulusApp = await createApp(app as any);

      // Verify mounting occurred
      expect(app.use).toHaveBeenCalledTimes(1);
      
      // Verify the returned properties
      expect(nodulusApp.modules).toHaveLength(1);
      expect(nodulusApp.modules[0].name).toBe('users');
      expect(nodulusApp.routes).toHaveLength(1);
      expect(nodulusApp.routes[0]).toEqual({
        method: 'GET',
        path: '/api/users/me',
        module: 'users',
        controller: 'UsersController'
      });
      expect(nodulusApp.registry).toBeDefined();
    });
  });

  it('should maintain atomic failure and prevent any route mount if a module is invalid', async () => {
    const invalidAppStructure: Record<string, string> = { ...validAppStructure };
    // This file deliberately fails validation!
    invalidAppStructure['src/modules/auth/index.ts'] = `
      // Missing Module() call!
    `;

    await runInTmpApp(invalidAppStructure, async (_, app) => {
      await expect(createApp(app as any)).rejects.toThrow(/No index.ts found calling Module/);
      
      // Atomic failure guarantee: no routes should be mounted if the pipeline exploded prematurely.
      expect(app.use).not.toHaveBeenCalled();
    });
  });

  it('should throw DUPLICATE_BOOTSTRAP when called twice with the same express app', async () => {
    await runInTmpApp(validAppStructure, async (_, app) => {
      await createApp(app as any);
      
      // Second run against the same referenced 'app' should trigger safety guard
      await expect(createApp(app as any)).rejects.toThrow(/was called more than once/);
    });
  });
});
