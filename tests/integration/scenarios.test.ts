import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from '../../src/bootstrap/createApp.js';
import { registry } from '../../src/core/registry.js';
import { NodulusError } from '../../src/core/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceUrl = pathToFileURL(path.resolve(__dirname, '../../src/index.ts')).href;

const runInTmpApp = async (files: Record<string, string>, tests: (tmpDir: string, app: any) => Promise<void>) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-integration-'));
  
  for (const [name, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const finalContent = content.replace(/\{\{SOURCE\}\}/g, sourceUrl);
    fs.writeFileSync(fullPath, finalContent);
  }
  
  const mockApp = { use: vi.fn() };
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

describe('Integration Tests V0.9.0', () => {
  afterEach(() => {
    registry.clearRegistry();
    vi.restoreAllMocks();
  });

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
        await expect(createApp(app as any)).rejects.toThrow(NodulusError);
        try {
          await createApp(app as any);
        } catch (err: any) {
          expect(err.code).toBe('EXPORT_MISMATCH');
          expect(err.details).toContain('NonExistentExport');
        }
      });
    });
  });

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
        await expect(createApp(app as any)).rejects.toThrow(NodulusError);
        try {
          await createApp(app as any);
        } catch (err: any) {
          expect(err.code).toBe('MISSING_IMPORT');
          expect(err.details).toContain('nonExistentModule');
        }
      });
    });
  });

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
        await expect(createApp(app as any)).rejects.toThrow(NodulusError);
        try {
          await createApp(app as any);
        } catch (err: any) {
          expect(err.code).toBe('CIRCULAR_DEPENDENCY');
        }
      });
    });

    it('does NOT throw in non-strict mode even with circular dependencies', async () => {
      await runInTmpApp({
        'nodulus.config.js': 'export default { strict: false };',
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
        const result = await createApp(app as any);
        expect(result.modules).toHaveLength(2);
      });
    });
  });

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
        await expect(createApp(app as any)).rejects.toThrow(NodulusError);
        try {
          await createApp(app as any);
        } catch (err: any) {
          expect(err.code).toBe('INVALID_CONTROLLER');
        }
      });
    });
  });

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

  describe('Strict Mode Warnings', () => {
    it('warns about undeclared exports in strict mode but does not interrupt bootstrap', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await runInTmpApp({
        'nodulus.config.js': 'export default { strict: true };',
        'src/modules/test/index.ts': `
          import { Module } from '{{SOURCE}}';
          Module('test', { exports: ['declaredExport'] });
          export const declaredExport = 1;
          export const undeclaredExport = 2;
        `
      }, async (_, app) => {
        const result = await createApp(app as any);
        expect(result.modules).toHaveLength(1);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Strict Mode')
        );
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('undeclaredExport')
        );
      });
      
      warnSpy.mockRestore();
    });
  });

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

  describe('Module aliases (@config)', () => {
    it('passes @config/database alias to the ESM resolver', async () => {
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
});
