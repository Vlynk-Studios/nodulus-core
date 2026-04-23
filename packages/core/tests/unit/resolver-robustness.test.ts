import { describe, it, expect, vi, afterEach } from 'vitest';
import { activateAliasResolver, clearAliasResolverOptions } from '../../src/aliases/resolver.js';
import { register } from 'node:module';
import path from 'node:path';

vi.mock('node:module', () => ({
  register: vi.fn()
}));

describe('ESM Resolver Robustness (P2)', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  afterEach(() => {
    vi.clearAllMocks();
    clearAliasResolverOptions();
  });

  it('should resolve subpaths for aliases without wildcard', async () => {
    await activateAliasResolver({}, { '@shared': './src/shared' }, mockLogger as any);
    
    const [dataUrl] = (register as any).mock.calls[0];
    const decoded = decodeURIComponent(dataUrl.replace('data:text/javascript,', ''));
    
    // Check if the resolve hook logic for subpaths is present
    expect(decoded).toContain('specifier.startsWith(alias + \'/\')');
    
    // Check if the generated JSON has absolute paths.
    const absoluteShared = path.resolve(process.cwd(), './src/shared');
    // Normalize for Windows backslashes in JSON
    const expected = absoluteShared.replace(/\\/g, '\\\\');
    expect(decoded).toContain(`"@shared":"${expected}"`);
  });

  it('should allow multiple registrations if aliases change (idempotency)', async () => {
    await activateAliasResolver({}, { '@a': './a' }, mockLogger as any);
    await activateAliasResolver({}, { '@b': './b' }, mockLogger as any);
    
    expect(register).toHaveBeenCalledTimes(2);
  });

  it('should skip registration if aliases are identical', async () => {
    await activateAliasResolver({}, { '@a': './a' }, mockLogger as any);
    await activateAliasResolver({}, { '@a': './a' }, mockLogger as any);
    
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('should handle wildcard aliases correctly with the new logic', async () => {
    await activateAliasResolver({}, { '@modules/*': './src/modules/*' }, mockLogger as any);
    
    const [dataUrl] = (register as any).mock.calls[0];
    const decoded = decodeURIComponent(dataUrl.replace('data:text/javascript,', ''));
    
    expect(decoded).toContain('alias.endsWith(\'/*\')');
    const absoluteModules = path.resolve(process.cwd(), './src/modules/*');
    const expected = absoluteModules.replace(/\\/g, '\\\\');
    expect(decoded).toContain(`"@modules/*":"${expected}"`);
  });
});
