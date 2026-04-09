import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { Service } from '../../src/identifiers/service.js';
import { createRegistry, registryContext, getActiveRegistry } from '../../src/core/registry.js';

describe('Service()', () => {
  it('registers with type: service when module is explicitly provided', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Service('UserService', { module: 'users' });

      const entry = getActiveRegistry().getService('UserService');

      expect(entry).toBeDefined();
      expect(entry?.name).toBe('UserService');
      expect(entry?.type).toBe('service');
      expect(entry?.module).toBe('users');
    });
  });

  it('infers the module from the parent folder name when module is omitted', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Service('InferredService');

      const entry = getActiveRegistry().getService('InferredService');

      expect(entry).toBeDefined();
      expect(entry?.type).toBe('service');
      // The parent folder of this test file is 'unit'
      expect(entry?.module).toBe('unit');
    });
  });

  it('stores the description when provided', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Service('DescribedService', { module: 'orders', description: 'Handles order creation' });

      const entry = getActiveRegistry().getService('DescribedService');
      expect(entry?.description).toBe('Handles order creation');
    });
  });

  it('getAllServices() returns all registered services', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Service('ServiceA', { module: 'alpha' });
      Service('ServiceB', { module: 'beta' });

      const all = getActiveRegistry().getAllServices();
      expect(all).toHaveLength(2);
      expect(all.map(s => s.name)).toContain('ServiceA');
      expect(all.map(s => s.name)).toContain('ServiceB');
    });
  });

  it('throws a descriptive error when called twice with the same name', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Service('DuplicateService', { module: 'users' });
      expect(() => Service('DuplicateService', { module: 'users' })).toThrowError(
        /DuplicateService/
      );
    });
  });

  it('throws NodulusError with code DUPLICATE_SERVICE on duplicate name', async () => {
    const { NodulusError } = await import('../../src/core/errors.js');
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Service('SameService', { module: 'payments' });
      expect(() => Service('SameService', { module: 'payments' })).toThrow(NodulusError);

      try {
        Service('SameService', { module: 'payments' });
      } catch (err: any) {
        expect(err.code).toBe('DUPLICATE_SERVICE');
      }
    });
  });

  it('does not affect module registration or controller registration', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Service('IsolatedService', { module: 'payments' });

      // No modules or controllers should be registered as a side-effect
      expect(getActiveRegistry().getAllModules()).toHaveLength(0);
      expect(getActiveRegistry().getAllControllersMetadata()).toHaveLength(0);
    });
  });
});
