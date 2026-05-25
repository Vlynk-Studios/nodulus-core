import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  extractModuleImports,
  extractRelativeCrossModuleImports,
  buildActiveAliasesFromConfig,
  getRegisteredAliases,
} from '../../src/cli/lib/import-scanner.js';
import { createRegistry } from '../../src/core/registry.js';

function writeTempFile(content: string, ext = '.ts'): string {
  const tmpPath = path.join(os.tmpdir(), `nodulus-cli-scanner-${Date.now()}-${Math.random()}${ext}`);
  fs.writeFileSync(tmpPath, content, 'utf-8');
  return tmpPath;
}

describe('cli/lib/import-scanner — REGLA-22', () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    tmpFiles.length = 0;
  });

  it('excludes third-party @scopes when only @modules is active', () => {
    const code = [
      "import Foo from '@types/node';",
      "import Ui from '@vitest/ui';",
      "import auth from '@modules/auth';",
    ].join('\n');
    const p = writeTempFile(code, '.js');
    tmpFiles.push(p);

    const result = extractModuleImports(p, ['@modules']);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe('@modules/auth');
  });

  it('includes custom config aliases when listed in activeAliases', () => {
    const code = [
      "import { db } from '@config/database';",
      "import { x } from '@nestjs/common';",
    ].join('\n');
    const p = writeTempFile(code);
    tmpFiles.push(p);

    const result = extractModuleImports(p, ['@modules', '@config']);
    expect(result.map(r => r.specifier)).toEqual(['@config/database']);
  });

  it('buildActiveAliasesFromConfig merges @modules with config aliases', () => {
    const aliases = buildActiveAliasesFromConfig({
      aliases: { '@middleware': './src/middleware' },
    });
    expect(aliases).toContain('@modules');
    expect(aliases).toContain('@middleware');
  });

  it('getRegisteredAliases returns registry keys without wildcards', () => {
    const registry = createRegistry();
    registry.registerAlias('@modules', '/abs/modules');
    registry.registerAlias('@modules/users', '/abs/modules/users');
    registry.registerAlias('@modules/users/*', '/abs/modules/users/*');
    registry.registerAlias('@config', '/abs/config');

    expect(getRegisteredAliases(registry)).toEqual(
      expect.arrayContaining(['@modules', '@modules/users', '@config']),
    );
    expect(getRegisteredAliases(registry)).not.toContain('@modules/users/*');
  });
});

describe('cli/lib/import-scanner — extractRelativeCrossModuleImports', () => {
  const tmpFiles: string[] = [];
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = '';
    }
  });

  it('detects ../ imports that escape the module directory', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-relative-'));
    const usersDir = path.join(tmpDir, 'src', 'modules', 'users');
    const paymentsDir = path.join(tmpDir, 'src', 'modules', 'payments');
    fs.mkdirSync(usersDir, { recursive: true });
    fs.mkdirSync(paymentsDir, { recursive: true });
    fs.writeFileSync(path.join(paymentsDir, 'payments.service.ts'), 'export class P {}');

    const serviceFile = path.join(usersDir, 'users.service.ts');
    fs.writeFileSync(
      serviceFile,
      "import { P } from '../payments/payments.service';\nimport { R } from './users.repository';",
    );
    tmpFiles.push(serviceFile);

    const cross = extractRelativeCrossModuleImports(serviceFile, usersDir);
    expect(cross.map(c => c.specifier)).toContain('../payments/payments.service');
    expect(cross.map(c => c.specifier)).not.toContain('./users.repository');
    expect(cross.find(c => c.specifier === '../payments/payments.service')?.line).toBe(1);
  });

  it('returns [] for missing file without throwing', () => {
    const log = vi.fn();
    const result = extractRelativeCrossModuleImports('/no/such/file.ts', '/module', log);
    expect(result).toEqual([]);
  });

  it('never throws on unreadable paths', () => {
    const log = vi.fn();
    expect(() =>
      extractRelativeCrossModuleImports('\0invalid', '/module', log),
    ).not.toThrow();
  });
});
