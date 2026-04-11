import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getDomainFromFilePath, getDomainSharedAllowed } from '../../src/utils/module-resolver.js';

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
