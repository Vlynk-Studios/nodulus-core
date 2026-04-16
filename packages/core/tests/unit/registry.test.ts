import { describe, it, expect } from 'vitest';
import { createRegistry, registryContext, getActiveRegistry, getRegistry } from '../../src/core/registry.js';
import { NodulusError } from '../../src/core/errors.js';

describe('Registry', () => {
  it('registers and retrieves a module', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      getActiveRegistry().registerModule(
        'users',
        { imports: [], exports: ['UserService'] },
        '/src/modules/users',
        '/src/modules/users/index.ts',
        'mod_users_001'
      );

      expect(getActiveRegistry().hasModule('users')).toBe(true);

      const registered = getActiveRegistry().getModule('users');
      expect(registered).toEqual({
        id: 'mod_users_001',
        name: 'users',
        path: '/src/modules/users',
        imports: [],
        exports: ['UserService'],
        controllers: []
      });

      const all = getActiveRegistry().getAllModules();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('users');
      expect(all[0].id).toBe('mod_users_001');
    });
  });

  it('throws DUPLICATE_MODULE when registering twice with same nitsId', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      const name = 'auth';
      const options = { imports: [], exports: [] };
      const dirPath = '/some/path';
      const indexPath = '/some/path/index.ts';
      const id = 'mod_auth_123';

      getActiveRegistry().registerModule(name, options, dirPath, indexPath, id);

      // Same ID, different everything else -> Still Duplicate
      expect(() => getActiveRegistry().registerModule('other', options, '/other', '/other/index.ts', id)).toThrowError(NodulusError);
      try {
        getActiveRegistry().registerModule('other', options, '/other', '/other/index.ts', id);
      } catch (e: any) {
        expect(e.code).toBe('DUPLICATE_MODULE');
      }
    });
  });

  it('allows duplicate names if paths and NITS IDs are different', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      // Module 1: users in root
      getActiveRegistry().registerModule(
        'users', 
        { imports: [] }, 
        '/src/modules/users', 
        '/src/modules/users/index.ts', 
        'mod_users_original'
      );

      // Module 2: users in a domain folder (pre-preparing v2.0.0)
      getActiveRegistry().registerModule(
        'users', 
        { imports: [] }, 
        '/src/domains/billing/modules/users', 
        '/src/domains/billing/modules/users/index.ts', 
        'mod_users_billing'
      );

      expect(getActiveRegistry().hasModule('users')).toBe(true);
      
      // In v1.4.0, getModule(name) returns the LAST one registered (modulesByName index behavior)
      const mod = getActiveRegistry().getModule('users');
      expect(mod?.id).toBe('mod_users_billing');
      
      expect(getActiveRegistry().getAllModules()).toHaveLength(2);
    });
  });

  it('registers and resolves aliases', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      getActiveRegistry().registerAlias('@config', '/src/config');
      getActiveRegistry().registerAlias('@shared', '/src/shared');

      expect(getActiveRegistry().resolveAlias('@config')).toBe('/src/config');
      expect(getActiveRegistry().resolveAlias('@shared')).toBe('/src/shared');
      expect(getActiveRegistry().resolveAlias('@unknown')).toBeUndefined();

      const all = getActiveRegistry().getAllAliases();
      expect(all).toEqual({
        '@config': '/src/config',
        '@shared': '/src/shared'
      });
    });
  });

  it('throws DUPLICATE_ALIAS when registering the same alias with a different target', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      getActiveRegistry().registerAlias('@utils', '/src/utils');

      expect(() => getActiveRegistry().registerAlias('@utils', '/src/utils')).not.toThrow();

      expect(() => getActiveRegistry().registerAlias('@utils', '/src/other-utils')).toThrowError(NodulusError);
      try {
        getActiveRegistry().registerAlias('@utils', '/src/other-utils');
      } catch (e: any) {
        expect(e.code).toBe('DUPLICATE_ALIAS');
      }
    });
  });

  it('getDependencyGraph() reflects declared imports', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      getActiveRegistry().registerModule('users', { imports: ['database'] }, '/users', '/users/index.ts', 'id_u');
      getActiveRegistry().registerModule('database', { imports: [] }, '/database', '/database/index.ts', 'id_d');

      const graph = getActiveRegistry().getDependencyGraph();
      expect(graph.get('users')).toEqual(['database']);
      expect(graph.get('database')).toEqual([]);
    });
  });

  it('findCircularDependencies() detects A -> B -> A', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      getActiveRegistry().registerModule('A', { imports: ['B'] }, '/a', '/a/index.ts', 'id_a');
      getActiveRegistry().registerModule('B', { imports: ['A'] }, '/b', '/b/index.ts', 'id_b');

      const cycles = getActiveRegistry().findCircularDependencies();
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toEqual(['A', 'B', 'A']);
    });
  });

  it('seeds and retrieves NITS IDs by path', () => {
    const r = createRegistry();
    r.seedNitsIds(new Map([['/abs/path', 'mod_123']]));
    
    expect(r.getNitsIdForPath('/abs/path')).toBe('mod_123');
    // Normalized
    expect(r.getNitsIdForPath('\\abs\\path')).toBe('mod_123');
    expect(r.getNitsIdForPath('/unknown')).toBeUndefined();
  });

  it('getRegistry() exposes NodulusRegistryAdvanced interface', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      const advancedRegistry = getRegistry();
      expect(advancedRegistry).toBeDefined();
      expect(typeof advancedRegistry.hasModule).toBe('function');
      expect(typeof advancedRegistry.getDependencyGraph).toBe('function');
    });
  });

  it('getActiveRegistry() throws REGISTRY_MISSING_CONTEXT outside createApp', () => {
    expect(() => getActiveRegistry()).toThrow(NodulusError);
    try {
      getActiveRegistry();
    } catch (e: any) {
      expect(e.code).toBe('REGISTRY_MISSING_CONTEXT');
    }
  });

  it('two concurrent registryContext.run() calls have isolated registries', async () => {
    const rA = createRegistry();
    const rB = createRegistry();

    await Promise.all([
      registryContext.run(rA, async () => {
        getActiveRegistry().registerModule('moduleA', {}, '/pathA', '/pathA/index.ts', 'id_a_unique');
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(getActiveRegistry().hasModule('moduleA')).toBe(true);
        expect(getActiveRegistry().hasModule('moduleB')).toBe(false);
      }),
      registryContext.run(rB, async () => {
        getActiveRegistry().registerModule('moduleB', {}, '/pathB', '/pathB/index.ts', 'id_b_unique');
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(getActiveRegistry().hasModule('moduleB')).toBe(true);
        expect(getActiveRegistry().hasModule('moduleA')).toBe(false);
      })
    ]);
  });
});
