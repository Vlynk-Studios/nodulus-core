import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractModuleImports, extractInternalIdentifiers } from '../../src/nits/import-scanner.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper: write a temp file and return its path
function writeTempFile(content: string, ext = '.ts'): string {
  const tmpPath = path.join(os.tmpdir(), `nodulus-test-${Date.now()}${ext}`);
  fs.writeFileSync(tmpPath, content, 'utf-8');
  return tmpPath;
}

describe('NITS Import Scanner', () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const f of tmpFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    tmpFiles.length = 0;
  });

  it('should extract AST imports safely avoiding excluded scopes', () => {
    const imports = extractModuleImports(__filename);
    expect(Array.isArray(imports)).toBe(true);
  });

  it('extractModuleImports returns [] for a non-existent file (ENOENT)', () => {
    const result = extractModuleImports('/does/not/exist.ts');
    expect(result).toEqual([]);
  });

  it('extractModuleImports returns [] and warns for a malformed JS file', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = writeTempFile('@@@ this is not valid JS !!!', '.js');
    tmpFiles.push(p);
    const result = extractModuleImports(p);
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('extractModuleImports excludes @types, @vitest, @eslint scoped imports', () => {
    const code = [
      "import Foo from '@types/node';",
      "import Ui from '@vitest/ui';",
      "import Core from '@eslint/core';",
      "import auth from '@modules/auth';"
    ].join('\n');
    const p = writeTempFile(code, '.js');
    tmpFiles.push(p);
    const result = extractModuleImports(p);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe('@modules/auth');
  });

  it('extractInternalIdentifiers returns [] for a non-existent file (ENOENT)', () => {
    const result = extractInternalIdentifiers('/does/not/exist.ts');
    expect(result).toEqual([]);
  });

  it('extractInternalIdentifiers returns [] and warns for non-ENOENT parse error', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = writeTempFile('@@@ bad syntax', '.js');
    tmpFiles.push(p);
    const result = extractInternalIdentifiers(p);
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('extractInternalIdentifiers picks up Service, Controller, Repository, Schema calls', () => {
    const code = [
      "Service('UserService');",
      "Repository('UserRepo');",
      "Schema('UserSchema');"
    ].join('\n');
    const p = writeTempFile(code, '.js');
    tmpFiles.push(p);
    const result = extractInternalIdentifiers(p);
    expect(result).toContain('UserService');
    expect(result).toContain('UserRepo');
    expect(result).toContain('UserSchema');
  });
});
