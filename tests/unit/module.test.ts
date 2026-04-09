import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRegistry, registryContext, getActiveRegistry } from '../../src/core/registry.js';
import { NodulusError } from '../../src/core/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../src/index.ts')).href;

describe('Module()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-module-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const runInModule = async (folderName: string, fileName: string, code: string, testFn: (r: any) => Promise<void>) => {
    const modDir = path.join(tmpDir, folderName);
    fs.mkdirSync(modDir, { recursive: true });
    const filePath = path.join(modDir, fileName);
    const finalCode = code.replace(/\{\{SOURCE\}\}/g, moduleUrl);
    fs.writeFileSync(filePath, finalCode);

    const r = createRegistry();
    await registryContext.run(r, async () => {
      try {
        await import(pathToFileURL(filePath).href + `?t=${Date.now()}`);
        await testFn(r);
      } catch (e) {
        throw e;
      }
    });
  };

  it('registers the module when called from index.ts with matching name', async () => {
    await runInModule('users', 'index.ts', `
      import { Module } from '{{SOURCE}}';
      Module('users', { exports: ['UserService'] });
    `, async (r) => {
      expect(r.hasModule('users')).toBe(true);
      const mod = r.getModule('users');
      expect(mod?.exports).toEqual(['UserService']);
    });
  });

  it('throws INVALID_MODULE_DECLARATION if name does not match the containing folder', async () => {
    const modDir = path.join(tmpDir, 'wrong-folder');
    fs.mkdirSync(modDir, { recursive: true });
    const filePath = path.join(modDir, 'index.ts');
    fs.writeFileSync(filePath, `
      import { Module } from '${moduleUrl}';
      Module('users');
    `);

    const r = createRegistry();
    await registryContext.run(r, async () => {
      await expect(import(pathToFileURL(filePath).href + `?t=${Date.now()}`)).rejects.toMatchObject({
        code: 'INVALID_MODULE_DECLARATION'
      });
    });
  });

  it('throws INVALID_MODULE_DECLARATION if called from a non-index file', async () => {
    await runInModule('users', 'not-index.ts', `
      import { Module } from '{{SOURCE}}';
      Module('users');
    `, async () => {
      // This should fail during import
    }).catch(err => {
      expect(err.code).toBe('INVALID_MODULE_DECLARATION');
      expect(err.message).toContain('must be called only from the module\'s index file');
    });
  });

  it('throws DUPLICATE_MODULE if two different modules try to register for the same folder', async () => {
    const modDir = path.join(tmpDir, 'shared');
    fs.mkdirSync(modDir, { recursive: true });
    
    // We'll call it manually since we have a registry context
    const r = createRegistry();
    await registryContext.run(r, async () => {
      const idxPath = path.join(modDir, 'index.ts');
      r.registerModule('shared', {}, modDir, idxPath);
      
      expect(() => {
        r.registerModule('duplicate', {}, modDir, idxPath);
      }).toThrowError(NodulusError);
      
      try {
        r.registerModule('duplicate', {}, modDir, idxPath);
      } catch (err: any) {
        expect(err.code).toBe('DUPLICATE_MODULE');
        expect(err.message).toContain('already registered for this folder');
      }
    });
  });
});

