import { describe, it, expect, vi, afterEach } from 'vitest';
import { updateAliasCache } from '../../src/aliases/cache.js';
import { getAliases } from '../../src/aliases/getAliases.js';
import * as resolver from '../../src/aliases/resolver.js';
import { register } from 'node:module';
import path from 'node:path';

vi.mock('node:module', () => ({
  register: vi.fn()
}));

describe('Aliases API V0.7.0', () => {
  afterEach(() => {
    vi.clearAllMocks();
    resolver.clearAliasResolverOptions();
  });

  // Helper: seed the cache as createApp would after Phase 3
  function seedCache(extra: Record<string, string> = {}) {
    updateAliasCache({
      '@modules/users': path.join(process.cwd(), 'modules/users'),
      '@config/database': path.join(process.cwd(), 'config/db'),
      ...extra
    });
  }

  it('getAliases() returns entries for all seeded aliases', () => {
    seedCache();
    const result = getAliases();
    expect(result['@modules/users']).toBeDefined();
    expect(result['@config/database']).toBeDefined();
  });

  it('getAliases({ includeFolders: false }) keeps @modules/* and drops others', () => {
    seedCache();
    const result = getAliases({ includeFolders: false });
    // @modules/* should still be present
    expect(result['@modules/users']).toBeDefined();
    // @config/* is not a @modules/ prefix — excluded
    expect(result['@config/database']).toBeUndefined();
  });

  it('getAliases({ absolute: true }) returns the exact stored paths', () => {
    seedCache();
    const result = getAliases({ absolute: true });
    expect(result['@modules/users']).toBe(path.join(process.cwd(), 'modules/users'));
    expect(result['@config/database']).toBe(path.join(process.cwd(), 'config/db'));
  });

  it('getAliases({ absolute: false }) returns POSIX-relative paths starting with ./', () => {
    seedCache();
    const result = getAliases({ absolute: false });
    for (const val of Object.values(result)) {
      expect(val.startsWith('./')).toBe(true);
      // POSIX — no backslashes
      expect(val).not.toContain('\\');
    }
  });

  it('activateAliasResolver registers the hook exactly once on repeated calls', () => {
    resolver.activateAliasResolver({ '@modules/users': '/absolute' }, { '@configs': '/configs' });
    resolver.activateAliasResolver({ '@modules/users': '/absolute' }, { '@configs': '/configs' });

    expect(register).toHaveBeenCalledTimes(1);

    const [dataUrl, opts] = (register as any).mock.calls[0];
    // Hook is a data: URL with embedded JS
    expect(dataUrl).toMatch(/^data:text\/javascript/);
    const decoded = decodeURIComponent(dataUrl.replace('data:text/javascript,', ''));
    // Aliases are baked into the hook source — not passed via data
    expect(decoded).toContain('@modules');
    expect(decoded).toContain('@configs');
    // parentURL is still passed for base resolution
    expect(opts).toHaveProperty('parentURL');
    // data field is no longer used
    expect(opts.data).toBeUndefined();
  });

  it('activateAliasResolver embeds all combined aliases into the hook source', () => {
    const moduleAliases = { '@modules/auth': '/path/auth' };
    const folderAliases = { '@shared': '/path/shared' };
    resolver.activateAliasResolver(moduleAliases, folderAliases);

    const [dataUrl] = (register as any).mock.calls[0];
    const decoded = decodeURIComponent(dataUrl.replace('data:text/javascript,', ''));
    // Both alias keys must appear in the serialised closure
    expect(decoded).toContain('@modules/auth');
    expect(decoded).toContain('@shared');
  });
});
