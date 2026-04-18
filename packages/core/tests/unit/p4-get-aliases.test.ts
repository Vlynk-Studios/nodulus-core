import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAliases, resolveAlias } from '../../src/index.js';
import { updateAliasCache, clearAliasCache } from '../../src/aliases/cache.js';

describe('P4 getAliases and resolveAlias', () => {
  const mockAliases = {
    '@modules/users': '/abs/path/to/users',
    '@modules/users/*': '/abs/path/to/users/*',
    '@shared': '/abs/path/to/shared',
    '@config': '/abs/path/to/config.ts'
  };

  beforeEach(() => {
    updateAliasCache(mockAliases);
  });

  afterEach(() => {
    clearAliasCache();
  });

  describe('getAliases', () => {
    it('should return all aliases by default', async () => {
      const aliases = await getAliases({ absolute: true });
      expect(aliases).toHaveProperty('@modules/users');
      expect(aliases).toHaveProperty('@shared');
      expect(aliases).toHaveProperty('@config');
      expect(aliases['@shared']).toBe('/abs/path/to/shared');
    });

    it('should exclude config aliases when includeConfigAliases is false', async () => {
      const aliases = await getAliases({ includeConfigAliases: false });
      expect(aliases).toHaveProperty('@modules/users');
      expect(aliases).toHaveProperty('@modules/users/*');
      expect(aliases).not.toHaveProperty('@shared');
      expect(aliases).not.toHaveProperty('@config');
    });

    it('should respect includeFolders as a legacy alias for includeConfigAliases', async () => {
      const aliases = await getAliases({ includeFolders: false });
      expect(aliases).toHaveProperty('@modules/users');
      expect(aliases).not.toHaveProperty('@shared');
    });

    it('should prioritize includeConfigAliases over includeFolders', async () => {
      // includeConfigAliases=true wins even if includeFolders=false
      const aliases = await getAliases({ includeConfigAliases: true, includeFolders: false });
      expect(aliases).toHaveProperty('@shared');
    });
  });

  describe('resolveAlias', () => {
    it('should resolve a single alias to its absolute path', () => {
      expect(resolveAlias('@shared')).toBe('/abs/path/to/shared');
      expect(resolveAlias('@modules/users')).toBe('/abs/path/to/users');
    });

    it('should return undefined for unknown aliases', () => {
      expect(resolveAlias('@unknown')).toBeUndefined();
    });
  });
});
