import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from '../../src/bootstrap/createApp.js';
import { NodulusError } from '../../src/core/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceUrl = pathToFileURL(path.resolve(__dirname, '../../src/index.ts')).href;

/**
 * Creates a fresh tmp directory with the given files, spies process.cwd(),
 * and provides a fresh mockApp for each invocation. The tmp directory is
 * deleted in `finally` regardless of test outcome.
 *
 * NOTE: ESM caches module execution. Each test MUST use a unique directory so
 * that dynamic imports resolve to uncached URLs. Calling createApp() twice
 * with the same file set will NOT re-execute Module() / Controller() on the
 * second call — therefore every test uses exactly one createApp() call and
 * asserts with rejects.toMatchObject({ code }) instead of try/catch.
 */
const runInTmpApp = async (
  files: Record<string, string>,
  tests: (tmpDir: string, app: ReturnType<typeof makeMockApp>) => Promise<void>
) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-integration-'));

  for (const [name, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const finalContent = content.replace(/\{\{SOURCE\}\}/g, sourceUrl);
    fs.writeFileSync(fullPath, finalContent);
  }

  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

  try {
    await tests(tmpDir, makeMockApp());
  } finally {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

function makeMockApp() {
  return { use: vi.fn() };
}

describe('Integration Tests V0.9.0', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // EXPORT_MISMATCH
  // -----------------------------------------------------------------------
  describe('EXPORT_MISMATCH', () => {
    it('throws EXPORT_MISMATCH when exports declares a name that does not exist in index.ts', async () => {
      await runInTmpApp({
        'nodulus.config.js': 'export default { strict: false };',
        'src/modules/auth/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('auth', { exports: ['NonExistentExport'] });
          export const something = 42;
        `
      }, async (_, app) => {
        await expect(createApp(app as any)).rejects.toMatchObject({
          code: 'EXPORT_MISMATCH',
        });
      });
    });

    it('EXPORT_MISMATCH details contains the missing export name', async () => {
      await runInTmpApp({
        'nodulus.config.js': 'export default { strict: false };',
        'src/modules/auth2/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('auth2', { exports: ['GhostExport'] });
          export const real = 1;
        `
      }, async (_, app) => {
        const err = await createApp(app as any).catch(e => e);
        expect(err).toBeInstanceOf(NodulusError);
        expect((err as NodulusError).code).toBe('EXPORT_MISMATCH');
        expect((err as NodulusError).details).toContain('GhostExport');
      });
    });
  });

  // -----------------------------------------------------------------------
  // MISSING_IMPORT
  // -----------------------------------------------------------------------
  describe('MISSING_IMPORT', () => {
    it('throws MISSING_IMPORT when imports references a non-existent module', async () => {
      await runInTmpApp({
        'nodulus.config.js': 'export default { strict: false };',
        'src/modules/users/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('users', { imports: ['nonExistentModule'] });
          export const foo = 'bar';
        `
      }, async (_, app) => {
        await expect(createApp(app as any)).rejects.toMatchObject({
          code: 'MISSING_IMPORT',
        });
      });
    });

    it('MISSING_IMPORT details references the missing module name', async () => {
      await runInTmpApp({
        'nodulus.config.js': 'export default { strict: false };',
        'src/modules/consumers/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('consumers', { imports: ['phantomModule'] });
        `
      }, async (_, app) => {
        const err = await createApp(app as any).catch(e => e);
        expect(err).toBeInstanceOf(NodulusError);
        expect((err as NodulusError).details).toContain('phantomModule');
      });
    });
  });

  // -----------------------------------------------------------------------
  // CIRCULAR_DEPENDENCY
  // -----------------------------------------------------------------------
  describe('CIRCULAR_DEPENDENCY', () => {
    it('throws CIRCULAR_DEPENDENCY in strict mode when A → B → A', async () => {
      await runInTmpApp({
        'nodulus.config.js': 'export default { strict: true };',
        'src/modules/mod-a/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('mod-a', { imports: ['mod-b'] });
          export const a = 1;
        `,
        'src/modules/mod-b/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('mod-b', { imports: ['mod-a'] });
          export const b = 2;
        `
      }, async (_, app) => {
        await expect(createApp(app as any)).rejects.toMatchObject({
          code: 'CIRCULAR_DEPENDENCY',
        });
      });
    });

    it('does NOT throw in non-strict mode even with circular dependencies', async () => {
      await runInTmpApp({
        'nodulus.config.js': 'export default { strict: false };',
        'src/modules/circ-a/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('circ-a', { imports: ['circ-b'] });
          export const a = 1;
        `,
        'src/modules/circ-b/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('circ-b', { imports: ['circ-a'] });
          export const b = 2;
        `
      }, async (_, app) => {
        const result = await createApp(app as any);
        expect(result.modules).toHaveLength(2);
      });
    });
  });

  // -----------------------------------------------------------------------
  // INVALID_CONTROLLER
  // -----------------------------------------------------------------------
  describe('INVALID_CONTROLLER', () => {
    it('throws INVALID_CONTROLLER when controller has no default export Router', async () => {
      await runInTmpApp({
        'nodulus.config.js': 'export default { strict: false };',
        'src/modules/test/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('test');
          export const testValue = 42;
        `,
        'src/modules/test/bad.controller.ts': `
          import { Controller } from '{{SOURCE}}';
          Controller('BadController', { prefix: '/bad' });
          export const foo = 'bar';
        `
      }, async (_, app) => {
        await expect(createApp(app as any)).rejects.toMatchObject({
          code: 'INVALID_CONTROLLER',
        });
      });
    });

    it('INVALID_CONTROLLER details contains the offending file path', async () => {
      await runInTmpApp({
        'nodulus.config.js': 'export default { strict: false };',
        'src/modules/badmod/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('badmod');
        `,
        'src/modules/badmod/no-router.ts': `
          import { Controller } from '{{SOURCE}}';
          Controller('NoRouter');
          export const notARouter = true;
        `
      }, async (_, app) => {
        const err = await createApp(app as any).catch(e => e);
        expect(err).toBeInstanceOf(NodulusError);
        expect((err as NodulusError).code).toBe('INVALID_CONTROLLER');
        expect((err as NodulusError).details).toContain('no-router');
      });
    });
  });

  // -----------------------------------------------------------------------
  // enabled: false
  // -----------------------------------------------------------------------
  describe('enabled: false', () => {
    it('does not mount routes for disabled controllers', async () => {
      await runInTmpApp({
        'nodulus.config.js': 'export default { prefix: "/api" };',
        'src/modules/users/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('users');
        `,
        'src/modules/users/active.routes.ts': `
          import { Controller } from '{{SOURCE}}';
          import { Router } from 'express';
          Controller('ActiveController', { prefix: '/active' });
          const router = Router();
          router.get('/test', (req, res) => res.json({ ok: true }));
          export default router;
        `,
        'src/modules/users/disabled.routes.ts': `
          import { Controller } from '{{SOURCE}}';
          import { Router } from 'express';
          Controller('DisabledController', { prefix: '/disabled', enabled: false });
          const router = Router();
          router.get('/test', (req, res) => res.json({ disabled: true }));
          export default router;
        `
      }, async (_, app) => {
        const result = await createApp(app as any);
        const activeRoutes = result.routes.filter(r => r.controller === 'ActiveController');
        const disabledRoutes = result.routes.filter(r => r.controller === 'DisabledController');
        expect(activeRoutes.length).toBeGreaterThan(0);
        expect(disabledRoutes.length).toBe(0);
      });
    });
  });

  // -----------------------------------------------------------------------
  // Strict Mode Warnings
  // -----------------------------------------------------------------------
  describe('Strict Mode Warnings', () => {
    it('warns about undeclared exports in strict mode but does not interrupt bootstrap', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await runInTmpApp({
        'nodulus.config.js': 'export default { strict: true };',
        'src/modules/test2/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('test2', { exports: ['declaredExport'] });
          export const declaredExport = 1;
          export const undeclaredExport = 2;
        `
      }, async (_, app) => {
        const result = await createApp(app as any);
        expect(result.modules).toHaveLength(1);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Strict Mode'));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('undeclaredExport'));
      });

      warnSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // Global Prefix
  // -----------------------------------------------------------------------
  describe('Global Prefix /api/v1', () => {
    it('mounts routes under /api/v1 prefix', async () => {
      await runInTmpApp({
        'nodulus.config.js': 'export default { prefix: "/api/v1" };',
        'src/modules/users/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('users');
        `,
        'src/modules/users/routes.ts': `
          import { Controller } from '{{SOURCE}}';
          import { Router } from 'express';
          Controller('UsersRoutes', { prefix: '/users' });
          const router = Router();
          router.get('/list', (req, res) => res.json([]));
          export default router;
        `
      }, async (_, app) => {
        const result = await createApp(app as any);
        expect(result.routes[0].path).toBe('/api/v1/users/list');
      });
    });
  });

  // -----------------------------------------------------------------------
  // Module aliases
  // -----------------------------------------------------------------------
  describe('Module aliases (@config)', () => {
    it('passes @config/database alias to the ESM resolver without error', async () => {
      await runInTmpApp({
        'nodulus.config.js': `
          export default {
            aliases: { '@config/database': './src/db' },
            strict: false
          };
        `,
        'src/modules/users/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('users');
          export const test = 'ok';
        `,
        'src/db/config.ts': `
          export const dbConfig = { host: 'localhost' };
        `
      }, async (_, app) => {
        const result = await createApp(app as any);
        expect(result.modules).toHaveLength(1);
        expect(result.modules[0].name).toBe('users');
      });
    });
  });

  // -----------------------------------------------------------------------
  // imports / exports validation
  // -----------------------------------------------------------------------
  describe('Module with imports/exports validation', () => {
    it('correctly validates modules with declared imports and exports', async () => {
      await runInTmpApp({
        'nodulus.config.js': 'export default { strict: false };',
        'src/modules/shared/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('shared', { exports: ['SharedService'] });
          export class SharedService {
            getData() { return 'data'; }
          }
        `,
        'src/modules/users/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('users', { imports: ['shared'], exports: ['UsersService'] });
          export class UsersService {
            getData() { return 'users data'; }
          }
        `
      }, async (_, app) => {
        const result = await createApp(app as any);
        expect(result.modules).toHaveLength(2);

        const users = result.modules.find(m => m.name === 'users');
        expect(users?.imports).toContain('shared');
        expect(users?.exports).toContain('UsersService');

        const shared = result.modules.find(m => m.name === 'shared');
        expect(shared?.exports).toContain('SharedService');
      });
    });
  });

  // -----------------------------------------------------------------------
  // DUPLICATE_BOOTSTRAP
  // -----------------------------------------------------------------------
  describe('DUPLICATE_BOOTSTRAP', () => {
    it('throws DUPLICATE_BOOTSTRAP when createApp() is called twice on the same Express instance', async () => {
      await runInTmpApp({
        'nodulus.config.js': 'export default { strict: false };',
        'src/modules/dup/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('dup');
        `
      }, async (_, app) => {
        await createApp(app as any);
        await expect(createApp(app as any)).rejects.toMatchObject({
          code: 'DUPLICATE_BOOTSTRAP',
        });
      });
    });
  });

  // -----------------------------------------------------------------------
  // NodulusApp shape
  // -----------------------------------------------------------------------
  describe('NodulusApp return shape', () => {
    it('returns modules, routes and a registry reference', async () => {
      await runInTmpApp({
        'nodulus.config.js': 'export default { prefix: "/api" };',
        'src/modules/shape/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('shape');
        `,
        'src/modules/shape/ctrl.ts': `
          import { Controller } from '{{SOURCE}}';
          import { Router } from 'express';
          Controller('ShapeCtrl', { prefix: '/shape' });
          const router = Router();
          router.get('/ping', (req, res) => res.json({ ok: true }));
          export default router;
        `
      }, async (_, app) => {
        const result = await createApp(app as any);
        expect(result.modules).toHaveLength(1);
        expect(result.modules[0].name).toBe('shape');
        expect(result.routes).toHaveLength(1);
        expect(result.routes[0]).toMatchObject({
          method: 'GET',
          path: '/api/shape/ping',
          module: 'shape',
          controller: 'ShapeCtrl'
        });
        expect(result.registry).toBeDefined();
        expect(typeof result.registry.hasModule).toBe('function');
      });
    });
  });
});
