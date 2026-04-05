import { describe, it, expect } from 'vitest';
import { Controller } from '../../src/identifiers/controller.js';
import { createRegistry, registryContext, getActiveRegistry } from '../../src/core/registry.js';

describe('Identifier: Controller() V1.0.0', () => {
  it('registers the controller in the registry with derived name from filename', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Controller('/users');

      const controllers = getActiveRegistry().getAllControllersMetadata();
      // The name should be derived from the current filename: 'controller.test'
      const entry = controllers.find(c => c.name === 'controller.test');

      expect(entry).toBeDefined();
      expect(entry?.name).toBe('controller.test');
      expect(entry?.prefix).toBe('/users');
      expect(entry?.middlewares).toEqual([]);
      expect(entry?.enabled).toBe(true);
    });
  });

  it('registers the controller with specific values (disabled)', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      // We can't easily test multiple calls in same file without registry clearing or different 'files'
      // but we can test options.
      Controller('/auth', { enabled: false });

      const entry = getActiveRegistry().getAllControllersMetadata()[0];
      expect(entry?.prefix).toBe('/auth');
      expect(entry?.enabled).toBe(false);
    });
  });

  it('throws Error if called more than once in the same file', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Controller('/first');
      expect(() => Controller('/second')).toThrowError(/once in the same file/);
    });
  });
});
