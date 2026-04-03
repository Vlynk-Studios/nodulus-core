import { describe, it, expect, beforeEach } from 'vitest';
import { registry, getRegistry } from '../../src/core/registry.js';
import { NodulusError } from '../../src/core/errors.js';
import type { ModuleEntry } from '../../src/types/index.js';

describe('Registry V0.3.0', () => {
  beforeEach(() => {
    registry.clear();
  });

  it('registers and retrieves a module', () => {
    registry.registerModule(
      'users', 
      { imports: [], exports: ['UserService'] }, 
      '/src/modules/users', 
      '/src/modules/users/index.ts'
    );

    expect(registry.hasModule('users')).toBe(true);
    
    // Getting the mapped RegisteredModule
    const registered = registry.getModule('users');
    expect(registered).toEqual({
      name: 'users',
      path: '/src/modules/users',
      imports: [],
      exports: ['UserService'],
      controllers: []
    });

    const all = registry.getAllModules();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('users');
  });

  it('throws DUPLICATE_MODULE when registering twice', () => {
    const name = 'auth';
    const options = { imports: [], exports: [] };
    const dirPath = '/some/path';
    const indexPath = '/some/path/index.ts';

    registry.registerModule(name, options, dirPath, indexPath);

    expect(() => registry.registerModule(name, options, dirPath, indexPath)).toThrowError(NodulusError);
    try {
      registry.registerModule(name, options, dirPath, indexPath);
    } catch (e: any) {
      expect(e.code).toBe('DUPLICATE_MODULE');
    }
  });

  it('registers and resolves aliases', () => {
    registry.registerAlias('@config', '/src/config');
    registry.registerAlias('@shared', '/src/shared');

    expect(registry.resolveAlias('@config')).toBe('/src/config');
    expect(registry.resolveAlias('@shared')).toBe('/src/shared');
    expect(registry.resolveAlias('@unknown')).toBeUndefined();

    const all = registry.getAllAliases();
    expect(all).toEqual({
      '@config': '/src/config',
      '@shared': '/src/shared'
    });
  });

  it('finds circular dependencies', () => {
    // A -> B -> C -> A
    registry.registerModule('moduleA', { imports: ['moduleB'] }, '', '');
    registry.registerModule('moduleB', { imports: ['moduleC'] }, '', '');
    registry.registerModule('moduleC', { imports: ['moduleA'] }, '', '');
    
    const cycles = registry.findCircularDependencies();
    expect(cycles.length).toBeGreaterThan(0);
    // Cycle A -> B -> C -> A means ['moduleA', 'moduleB', 'moduleC', 'moduleA']
    expect(cycles[0]).toEqual(['moduleA', 'moduleB', 'moduleC', 'moduleA']);
  });

  it('getRegistry() exposes NodulusRegistryAdvanced interface', () => {
    const advancedRegistry = getRegistry();
    expect(advancedRegistry).toBeDefined();
    expect(typeof advancedRegistry.hasModule).toBe('function');
    expect(typeof advancedRegistry.getDependencyGraph).toBe('function');
    // Muta interface not exposed statically on the return type, but instance is identical
  });
});
