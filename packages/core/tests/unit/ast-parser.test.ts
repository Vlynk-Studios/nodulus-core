import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractIdentifierCall } from '../../src/cli/lib/ast-parser.js';

describe('ast-parser tests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runWithTempFile = (content: string, testFn: (filePath: string) => void) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-ast-'));
    const filePath = path.join(tmpDir, 'index.ts');
    fs.writeFileSync(filePath, content);
    
    try {
      testFn(filePath);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };

  it('correctly detects Module("users", { imports: ["auth"] })', () => {
    runWithTempFile(`
      import { Module } from '@vlynk-studios/nodulus-core';
      Module('users', { imports: ['auth'] });
    `, (filePath) => {
      const res = extractIdentifierCall(filePath, 'Module');
      expect(res).not.toBeNull();
      expect(res?.name).toBe('users');
      expect(res?.options).toEqual({ imports: ['auth'] });
    });
  });

  it('correctly detects Domain("billing", { modules: ["payments"] })', () => {
    runWithTempFile(`
      import { Domain } from '@vlynk-studios/nodulus-core';
      Domain('billing', { modules: ['payments'] });
    `, (filePath) => {
      const res = extractIdentifierCall(filePath, 'Domain');
      expect(res).not.toBeNull();
      expect(res?.name).toBe('billing');
      expect(res?.options).toEqual({ modules: ['payments'] });
    });
  });

  it('returns null if the callee does not match the requested name', () => {
    runWithTempFile(`
      import { Module } from '@vlynk-studios/nodulus-core';
      Module('core', { imports: [] });
    `, (filePath) => {
      const res = extractIdentifierCall(filePath, 'Domain'); // requesting Domain when it is Module
      expect(res).toBeNull();
    });
  });

  it('returns null if the file does not contain any call to the requested callee', () => {
    runWithTempFile(`
      export const utils = () => {};
      console.log('No identifiers here');
    `, (filePath) => {
      const res = extractIdentifierCall(filePath, 'Module');
      expect(res).toBeNull();
    });
  });

  it('identifies call expressions via fallback regex for unsupported syntaxes (e.g. decorators, pure TS)', () => {
    runWithTempFile(`
      @Controller('/api')
      export class MyController {
        constructor() {
          Controller('UserController');
        }
      }
    `, (filePath) => {
      const res = extractIdentifierCall(filePath, 'Controller');
      expect(res).not.toBeNull();
      expect(res?.name).toBe('UserController');
    });
  });

  it('identifies call expressions via fallback regex even if code is malformed for acorn', () => {
    runWithTempFile(`
      import type { SomeType } from "./types";
      // bad syntax that throws acorn parser Error
      @@@
      Service('TestService');
    `, (filePath) => {
      const res = extractIdentifierCall(filePath, 'Service');
      expect(res).not.toBeNull();
      expect(res?.name).toBe('TestService');
    });
  });
});
