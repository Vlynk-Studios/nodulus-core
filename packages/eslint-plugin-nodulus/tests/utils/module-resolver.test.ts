import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getDomainFromFilePath,
  getDomainSharedAllowed,
  findModuleRoot,
  getActiveNodulusAliases,
  isRelativeBoundaryCrossing,
  clearAllResolverCaches,
} from '../../src/utils/module-resolver.js';

describe('module-resolver cache and parsing', () => {
  it('extracts domain from physical nested paths correctly', () => {
    expect(getDomainFromFilePath('src/domains/billing/modules/payments/payments.service.ts')).toBe('billing');
  });

  it('fails gracefully returning null if it is a standard non-domain module', () => {
    expect(getDomainFromFilePath('src/modules/users/users.service.ts')).toBeNull();
  });

  it('recognizes _shared as a valid global domain intercept layer', () => {
    expect(getDomainFromFilePath('src/domains/_shared/permissions/permissions.service.ts')).toBe('_shared');
  });

  it('parses DomainShared structure successfully extracting allowedDomains array', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-shared-'));
    const indexPath = path.join(tmpDir, 'index.ts');
    
    fs.writeFileSync(indexPath, `
      import { DomainShared } from '@vlynk-studios/nodulus-core';
      DomainShared('permissions', { allowedDomains: ['billing', 'audit'] });
    `);

    try {
      const result = getDomainSharedAllowed(indexPath);
      expect(result).toEqual(['billing', 'audit']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('findModuleRoot locates directory with Module() declaration', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-modroot-'));
    const usersDir = path.join(tmpDir, 'src', 'modules', 'users');
    fs.mkdirSync(usersDir, { recursive: true });
    fs.writeFileSync(
      path.join(usersDir, 'index.ts'),
      "import { Module } from '@vlynk-studios/nodulus-core';\nModule('users', { imports: [] });",
    );
    fs.writeFileSync(path.join(usersDir, 'users.service.ts'), 'export class U {}');

    try {
      const root = findModuleRoot(
        path.join(usersDir, 'users.service.ts'),
        tmpDir,
        'src/modules',
      );
      expect(root?.replace(/\\/g, '/')).toContain('src/modules/users');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      clearAllResolverCaches();
    }
  });

  it('getActiveNodulusAliases reads nodulus.config.js', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-aliases-'));
    fs.writeFileSync(
      path.join(tmpDir, 'nodulus.config.js'),
      "export default { aliases: { '@middleware': './src/middleware' } };",
    );

    try {
      expect(getActiveNodulusAliases(tmpDir)).toEqual(
        expect.arrayContaining(['@modules', '@middleware']),
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      clearAllResolverCaches();
    }
  });

  it('isRelativeBoundaryCrossing detects ../ escaping module root', () => {
    const moduleRoot = '/project/src/modules/users';
    const file = '/project/src/modules/users/users.service.ts';
    expect(isRelativeBoundaryCrossing('../payments/pay.ts', file, moduleRoot)).toBe(true);
    expect(isRelativeBoundaryCrossing('./repo.ts', file, moduleRoot)).toBe(false);
  });

  it('returns null when DomainShared does not exist inside the target index boundary', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-shared-'));
    const indexPath = path.join(tmpDir, 'index.ts');
    
    fs.writeFileSync(indexPath, `
      // Normal code without annotations
      export const helper = true;
    `);

    try {
      const result = getDomainSharedAllowed(indexPath);
      expect(result).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
