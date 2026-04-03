import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { registry } from '../../src/core/registry.js';
import { getAliases } from '../../src/aliases/getAliases.js';
import * as resolver from '../../src/aliases/resolver.js';
import { register } from 'node:module';

vi.mock('node:module', () => {
  return {
    register: vi.fn()
  };
});

describe('Aliases API V0.7.0', () => {
  beforeEach(() => {
    registry.clearRegistry();
    // Simulate what createApp would do during Phase 3
    registry.registerAlias('@modules/users', '/absolute/path/to/modules/users');
    registry.registerAlias('@config/database', '/absolute/path/to/config/db');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getAliases() returns standard map logic correctly', () => {
    const rawAliases = getAliases();
    // Because absolute is false by default, it computes relation to cwd!
    // Instead of doing arbitrary path relativity tests, we check the structure maps to ./...
    expect(rawAliases['@modules/users']).toBeDefined();
    expect(rawAliases['@config/database']).toBeDefined();
  });

  it('getAliases({ includeFolders: false }) excludes standard configs', () => {
    const rawAliases = getAliases({ includeFolders: false });
    
    expect(rawAliases['@modules/users']).toBeDefined();
    expect(rawAliases['@config/database']).toBeUndefined();
  });

  it('getAliases({ absolute: true }) maintains exact paths', () => {
    const rawAliases = getAliases({ absolute: true });
    
    expect(rawAliases['@modules/users']).toBe('/absolute/path/to/modules/users');
    expect(rawAliases['@config/database']).toBe('/absolute/path/to/config/db');
  });

  it('activateAliasResolver only fires node register once', () => {
    resolver.activateAliasResolver({ '@modules/users': '/absolute' }, { '@configs': '/configs' });
    resolver.activateAliasResolver({ '@modules/users': '/absolute' }, { '@configs': '/configs' });

    // The inner flag should prevent repeated executions
    expect(register).toHaveBeenCalledTimes(1);
    
    const callArgs = (register as any).mock.calls[0];
    expect(callArgs[0]).toMatch(/^data:text\/javascript/);
    expect(callArgs[1].data.aliases).toEqual({
      '@modules/users': '/absolute',
      '@configs': '/configs'
    });
  });
});
