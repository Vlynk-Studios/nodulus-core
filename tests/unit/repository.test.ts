import { describe, it, expect } from 'vitest';
import { Repository } from '../../src/identifiers/repository.js';
import { createRegistry, registryContext, getActiveRegistry } from '../../src/core/registry.js';

describe('Identifier: Repository() V1.0.0', () => {
  it('registers with type: repository when module is explicitly provided', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Repository('UserRepository', { module: 'users' });

      const entry = getActiveRegistry().getRepository('UserRepository');

      expect(entry).toBeDefined();
      expect(entry?.name).toBe('UserRepository');
      expect(entry?.type).toBe('repository');
      expect(entry?.module).toBe('users');
    });
  });

  it('infers the module from the parent folder name when module is omitted', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Repository('InferredRepository');

      const entry = getActiveRegistry().getRepository('InferredRepository');

      expect(entry).toBeDefined();
      expect(entry?.type).toBe('repository');
      // The parent folder of this test file is 'unit'
      expect(entry?.module).toBe('unit');
    });
  });

  it('stores source correctly in the registry', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Repository('OrderRepository', { module: 'orders', source: 'database' });

      const entry = getActiveRegistry().getRepository('OrderRepository');
      expect(entry?.source).toBe('database');
    });
  });

  it('stores description when provided', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Repository('CacheRepository', { module: 'analytics', source: 'cache', description: 'Redis-backed cache repository' });

      const entry = getActiveRegistry().getRepository('CacheRepository');
      expect(entry?.description).toBe('Redis-backed cache repository');
      expect(entry?.source).toBe('cache');
    });
  });

  it('accepts arbitrary string values for source', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Repository('ExternalRepo', { module: 'billing', source: 'graphql' });

      const entry = getActiveRegistry().getRepository('ExternalRepo');
      expect(entry?.source).toBe('graphql');
    });
  });

  it('getAllRepositories() returns all registered repositories', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Repository('RepoA', { module: 'alpha', source: 'database' });
      Repository('RepoB', { module: 'beta',  source: 'api' });

      const all = getActiveRegistry().getAllRepositories();
      expect(all).toHaveLength(2);
      expect(all.map(repo => repo.name)).toContain('RepoA');
      expect(all.map(repo => repo.name)).toContain('RepoB');
    });
  });

  it('throws a descriptive error when called twice with the same name', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Repository('DuplicateRepository', { module: 'users' });
      expect(() => Repository('DuplicateRepository', { module: 'users' })).toThrowError(
        /DuplicateRepository/
      );
    });
  });

  it('throws NodulusError with code DUPLICATE_REPOSITORY on duplicate name', async () => {
    const { NodulusError } = await import('../../src/core/errors.js');
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Repository('SameRepo', { module: 'payments' });

      let caught: any;
      try {
        Repository('SameRepo', { module: 'payments' });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(NodulusError);
      expect(caught?.code).toBe('DUPLICATE_REPOSITORY');
    });
  });

  it('does not affect module, controller, or service registration', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Repository('IsolatedRepo', { module: 'payments', source: 'file' });

      expect(getActiveRegistry().getAllModules()).toHaveLength(0);
      expect(getActiveRegistry().getAllControllersMetadata()).toHaveLength(0);
      expect(getActiveRegistry().getAllServices()).toHaveLength(0);
    });
  });
});
