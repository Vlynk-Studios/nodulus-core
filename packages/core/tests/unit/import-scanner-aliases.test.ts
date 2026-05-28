import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  extractModuleImports,
  extractRelativeCrossModuleImports,
} from '../../src/cli/lib/import-scanner.js';

function writeTempFile(content: string, ext = '.ts'): string {
  const tmpPath = path.join(
    os.tmpdir(),
    `nodulus-scanner-aliases-${Date.now()}-${Math.random()}${ext}`,
  );
  fs.writeFileSync(tmpPath, content, 'utf-8');
  return tmpPath;
}

describe('import-scanner — extractRelativeCrossModuleImports()', () => {
  let tmpDir: string;
  const tmpFiles: string[] = [];

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = '';
    }
    for (const f of tmpFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    tmpFiles.length = 0;
  });

  function setupModuleTree(): { usersDir: string; serviceFile: string } {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-relative-aliases-'));
    const usersDir = path.join(tmpDir, 'src', 'modules', 'users');
    const paymentsDir = path.join(tmpDir, 'src', 'modules', 'payments');
    const sharedDir = path.join(tmpDir, 'src', 'shared');
    fs.mkdirSync(usersDir, { recursive: true });
    fs.mkdirSync(paymentsDir, { recursive: true });
    fs.mkdirSync(sharedDir, { recursive: true });
    fs.writeFileSync(path.join(paymentsDir, 'payments.service.ts'), 'export class P {}');
    fs.writeFileSync(path.join(sharedDir, 'utils.ts'), 'export const u = 1;');
    const serviceFile = path.join(usersDir, 'users.service.ts');
    return { usersDir, serviceFile };
  }

  it('file with import ./local → empty array (internal import)', () => {
    const { usersDir, serviceFile } = setupModuleTree();
    fs.writeFileSync(serviceFile, "import X from './local';");
    expect(extractRelativeCrossModuleImports(serviceFile, usersDir)).toEqual([]);
  });

  it('file with import ../payments/payments.service → returns the specifier', () => {
    const { usersDir, serviceFile } = setupModuleTree();
    fs.writeFileSync(serviceFile, "import { P } from '../payments/payments.service';");
    const cross = extractRelativeCrossModuleImports(serviceFile, usersDir);
    expect(cross.map(c => c.specifier)).toEqual(['../payments/payments.service']);
  });

  it('file with import ../../shared/utils → returns the specifier', () => {
    const { usersDir, serviceFile } = setupModuleTree();
    fs.writeFileSync(serviceFile, "import { u } from '../../shared/utils';");
    const cross = extractRelativeCrossModuleImports(serviceFile, usersDir);
    expect(cross.map(c => c.specifier)).toEqual(['../../shared/utils']);
  });

  it('file with import @modules/payments → empty array (alias, not relative)', () => {
    const { usersDir, serviceFile } = setupModuleTree();
    fs.writeFileSync(serviceFile, "import { P } from '@modules/payments';");
    expect(extractRelativeCrossModuleImports(serviceFile, usersDir)).toEqual([]);
  });

  it('empty file → empty array without throwing', () => {
    const { usersDir, serviceFile } = setupModuleTree();
    fs.writeFileSync(serviceFile, '');
    expect(() => extractRelativeCrossModuleImports(serviceFile, usersDir)).not.toThrow();
    expect(extractRelativeCrossModuleImports(serviceFile, usersDir)).toEqual([]);
  });

  it('file that does not exist → empty array without throwing', () => {
    const log = vi.fn();
    expect(() =>
      extractRelativeCrossModuleImports('/no/such/file.ts', '/module', log),
    ).not.toThrow();
    expect(extractRelativeCrossModuleImports('/no/such/file.ts', '/module', log)).toEqual([]);
  });

  it('multiple imports: only returns cross-module ones', () => {
    const { usersDir, serviceFile } = setupModuleTree();
    fs.writeFileSync(
      serviceFile,
      [
        "import { P } from '../payments/payments.service';",
        "import { R } from './users.repository';",
        "import { u } from '../../shared/utils';",
        "import { M } from '@modules/payments';",
      ].join('\n'),
    );
    const cross = extractRelativeCrossModuleImports(serviceFile, usersDir);
    expect(cross.map(c => c.specifier).sort()).toEqual(
      ['../../shared/utils', '../payments/payments.service'].sort(),
    );
    expect(cross.map(c => c.specifier)).not.toContain('./users.repository');
  });
});

describe('import-scanner — RULE-22 (inverted filtering)', () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    tmpFiles.length = 0;
  });

  it('@nestjs/common with aliases [@modules] → filtered', () => {
    const p = writeTempFile("import { Injectable } from '@nestjs/common';");
    tmpFiles.push(p);
    expect(extractModuleImports(p, ['@modules'])).toEqual([]);
  });

  it('@types/express → filtrado', () => {
    const p = writeTempFile("import { Request } from '@types/express';");
    tmpFiles.push(p);
    expect(extractModuleImports(p, ['@modules'])).toEqual([]);
  });

  it('@modules/users → incluido', () => {
    const p = writeTempFile("import { UsersService } from '@modules/users';");
    tmpFiles.push(p);
    const result = extractModuleImports(p, ['@modules']);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe('@modules/users');
  });

  it('@config/database with @config registered → included', () => {
    const p = writeTempFile("import { db } from '@config/database';");
    tmpFiles.push(p);
    const result = extractModuleImports(p, ['@modules', '@config']);
    expect(result.map(r => r.specifier)).toEqual(['@config/database']);
  });

  it('@config/database without @config registered → filtered', () => {
    const p = writeTempFile("import { db } from '@config/database';");
    tmpFiles.push(p);
    expect(extractModuleImports(p, ['@modules'])).toEqual([]);
  });

  it('express (without @) → always filtered', () => {
    const p = writeTempFile("import express from 'express';");
    tmpFiles.push(p);
    expect(extractModuleImports(p, ['@modules', '@config'])).toEqual([]);
  });
});
