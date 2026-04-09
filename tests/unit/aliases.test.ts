import { describe, it, expect, vi, afterEach } from 'vitest';
import { updateAliasCache, clearAliasCache } from '../../src/aliases/cache.js';
import { getAliases } from '../../src/aliases/getAliases.js';
import * as resolver from '../../src/aliases/resolver.js';
import { register } from 'node:module';
import path from 'node:path';

vi.mock('node:module', () => ({
  register: vi.fn()
}));

describe('Aliases API', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  afterEach(() => {
    vi.clearAllMocks();
    resolver.clearAliasResolverOptions();
    clearAliasCache();
  });

  // Helper: seed the cache as createApp would after Phase 3
  function seedCache(extra: Record<string, string> = {}) {
    updateAliasCache({
      '@modules/users': path.join(process.cwd(), 'modules/users'),
      '@config/database': path.join(process.cwd(), 'config/db'),
      ...extra
    });
  }

  it('getAliases() returns {} without throwing when called before createApp()', async () => {
    // clearAliasCache ensures we are working with an empty cache
    clearAliasCache();
    const result = await getAliases();
    expect(result).toEqual({});
  });

  it('getAliases() returns entries for all seeded aliases', async () => {
    seedCache();
    const result = await getAliases();
    expect(result['@modules/users']).toBeDefined();
    expect(result['@config/database']).toBeDefined();
  });

  it('getAliases({ includeFolders: false }) keeps @modules/* and drops others', async () => {
    seedCache();
    const result = await getAliases({ includeFolders: false });
    // @modules/* should still be present
    expect(result['@modules/users']).toBeDefined();
    // @config/* is not a @modules/ prefix — excluded
    expect(result['@config/database']).toBeUndefined();
  });

  it('getAliases({ absolute: true }) returns the exact stored paths', async () => {
    seedCache();
    const result = await getAliases({ absolute: true });
    expect(result['@modules/users']).toBe(path.join(process.cwd(), 'modules/users'));
    expect(result['@config/database']).toBe(path.join(process.cwd(), 'config/db'));
  });

  it('getAliases({ absolute: false }) returns POSIX-relative paths starting with ./', async () => {
    seedCache();
    const result = await getAliases({ absolute: false });
    for (const val of Object.values(result)) {
      expect(val.startsWith('./')).toBe(true);
      // POSIX — no backslashes
      expect(val).not.toContain('\\');
    }
  });

  it('activateAliasResolver registers the hook exactly once on repeated calls', () => {
    resolver.activateAliasResolver({ '@modules/users': '/absolute' }, { '@configs': '/configs' }, mockLogger as any);
    resolver.activateAliasResolver({ '@modules/users': '/absolute' }, { '@configs': '/configs' }, mockLogger as any);

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
    resolver.activateAliasResolver(moduleAliases, folderAliases, mockLogger as any);

    const [dataUrl] = (register as any).mock.calls[0];
    const decoded = decodeURIComponent(dataUrl.replace('data:text/javascript,', ''));
    // Both alias keys must appear in the serialised closure
    expect(decoded).toContain('@modules/auth');
    expect(decoded).toContain('@shared');
  });

  it('user configured aliases take precedence over auto-generated module aliases', () => {
    const moduleAliases = { '@modules/auth': '/path/auto' };
    const folderAliases = { '@modules/auth': '/path/configured' };
    resolver.activateAliasResolver(moduleAliases, folderAliases, mockLogger as any);

    const [dataUrl] = (register as any).mock.calls[0];
    const decoded = decodeURIComponent(dataUrl.replace('data:text/javascript,', ''));
    
    // The literal object string should contain the configured target, not the auto one
    const expectedAliasEntry = '"@modules/auth":"/path/configured"';
    expect(decoded).toContain(expectedAliasEntry);
  });
});
