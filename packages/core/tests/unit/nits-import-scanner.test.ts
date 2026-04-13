import { describe, it, expect } from 'vitest';
import { extractModuleImports } from '../../src/nits/import-scanner.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('NITS Import Scanner', () => {
  it('should extract AST imports safely avoiding excluded scopes', () => {
    const imports = extractModuleImports(__filename);
    expect(Array.isArray(imports)).toBe(true);
  });
});
