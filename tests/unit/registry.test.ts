import { describe, it, expect } from 'vitest';
import { createRegistry, registryContext, getActiveRegistry, getRegistry } from '../../src/core/registry.js';
import { NodulusError } from '../../src/core/errors.js';

describe('Registry V0.3.0', () => {
  it('registers and retrieves a module', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      getActiveRegistry().registerModule(
        'users',
        { imports: [], exports: ['UserService'] },
        '/src/modules/users',
        '/src/modules/users/index.ts'
      );

      expect(getActiveRegistry().hasModule('users')).toBe(true);

      // Getting the mapped RegisteredModule
      const registered = getActiveRegistry().getModule('users');
      expect(registered).toEqual({
        name: 'users',
        path: '/src/modules/users',
        imports: [],
        exports: ['UserService'],
        controllers: []
      });

      const all = getActiveRegistry().getAllModules();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('users');
    });
  });

  it('throws DUPLICATE_MODULE when registering twice', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      const name = 'auth';
      const options = { imports: [], exports: [] };
      const dirPath = '/some/path';
      const indexPath = '/some/path/index.ts';

      getActiveRegistry().registerModule(name, options, dirPath, indexPath);

      expect(() => getActiveRegistry().registerModule(name, options, dirPath, indexPath)).toThrowError(NodulusError);
      try {
        getActiveRegistry().registerModule(name, options, dirPath, indexPath);
      } catch (e: any) {
        expect(e.code).toBe('DUPLICATE_MODULE');
      }
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

      // Repeating the same target is fine (idempotent)
      expect(() => getActiveRegistry().registerAlias('@utils', '/src/utils')).not.toThrow();

      // Different target throws error
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
      getActiveRegistry().registerModule('users', { imports: ['database'] }, '', '');
      getActiveRegistry().registerModule('database', { imports: [] }, '', '');

      const graph = getActiveRegistry().getDependencyGraph();
      expect(graph.get('users')).toEqual(['database']);
      expect(graph.get('database')).toEqual([]);
    });
  });

  it('findCircularDependencies() detects A -> B -> A', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      getActiveRegistry().registerModule('A', { imports: ['B'] }, '', '');
      getActiveRegistry().registerModule('B', { imports: ['A'] }, '', '');

      const cycles = getActiveRegistry().findCircularDependencies();
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toEqual(['A', 'B', 'A']);
    });
  });

  it('findCircularDependencies() detects A -> B -> C -> A', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      getActiveRegistry().registerModule('moduleA', { imports: ['moduleB'] }, '', '');
      getActiveRegistry().registerModule('moduleB', { imports: ['moduleC'] }, '', '');
      getActiveRegistry().registerModule('moduleC', { imports: ['moduleA'] }, '', '');

      const cycles = getActiveRegistry().findCircularDependencies();
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toEqual(['moduleA', 'moduleB', 'moduleC', 'moduleA']);
    });
  });

  it('findCircularDependencies() returns [] if there are no cycles', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      getActiveRegistry().registerModule('X', { imports: ['Y'] }, '', '');
      getActiveRegistry().registerModule('Y', { imports: ['Z'] }, '', '');
      getActiveRegistry().registerModule('Z', { imports: [] }, '', '');

      const cycles = getActiveRegistry().findCircularDependencies();
      expect(cycles).toEqual([]);
    });
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

  // -- Context isolation tests --

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
        getActiveRegistry().registerModule('moduleA', {}, '/pathA', '/pathA/index.ts');
        // Yield to allow the other context to run
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(getActiveRegistry().hasModule('moduleA')).toBe(true);
        expect(getActiveRegistry().hasModule('moduleB')).toBe(false);
      }),
      registryContext.run(rB, async () => {
        getActiveRegistry().registerModule('moduleB', {}, '/pathB', '/pathB/index.ts');
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(getActiveRegistry().hasModule('moduleB')).toBe(true);
        expect(getActiveRegistry().hasModule('moduleA')).toBe(false);
      })
    ]);
  });
});
