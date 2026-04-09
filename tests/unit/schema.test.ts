import { describe, it, expect } from 'vitest';
import { Schema } from '../../src/identifiers/schema.js';
import { createRegistry, registryContext, getActiveRegistry } from '../../src/core/registry.js';

describe('Schema()', () => {
  it('registers with type: schema when module is explicitly provided', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Schema('CreateUserSchema', { module: 'users' });

      const entry = getActiveRegistry().getSchema('CreateUserSchema');

      expect(entry).toBeDefined();
      expect(entry?.name).toBe('CreateUserSchema');
      expect(entry?.type).toBe('schema');
      expect(entry?.module).toBe('users');
    });
  });

  it('infers the module from the parent folder name when module is omitted', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Schema('InferredSchema');

      const entry = getActiveRegistry().getSchema('InferredSchema');

      expect(entry).toBeDefined();
      expect(entry?.type).toBe('schema');
      // The parent folder of this test file is 'unit'
      expect(entry?.module).toBe('unit');
    });
  });

  it('stores library correctly in the registry', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Schema('OrderSchema', { module: 'orders', library: 'zod' });

      const entry = getActiveRegistry().getSchema('OrderSchema');
      expect(entry?.library).toBe('zod');
    });
  });

  it('stores description when provided', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Schema('LoginSchema', { module: 'auth', library: 'joi', description: 'Login request body validation' });

      const entry = getActiveRegistry().getSchema('LoginSchema');
      expect(entry?.description).toBe('Login request body validation');
      expect(entry?.library).toBe('joi');
    });
  });

  it('accepts arbitrary string values for library', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Schema('CustomSchema', { module: 'billing', library: 'superstruct' });

      const entry = getActiveRegistry().getSchema('CustomSchema');
      expect(entry?.library).toBe('superstruct');
    });
  });

  it('getAllSchemas() returns all registered schemas', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Schema('SchemaA', { module: 'alpha', library: 'zod' });
      Schema('SchemaB', { module: 'beta',  library: 'yup' });

      const all = getActiveRegistry().getAllSchemas();
      expect(all).toHaveLength(2);
      expect(all.map(s => s.name)).toContain('SchemaA');
      expect(all.map(s => s.name)).toContain('SchemaB');
    });
  });

  it('throws a descriptive error when called twice with the same name', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Schema('DuplicateSchema', { module: 'users' });
      expect(() => Schema('DuplicateSchema', { module: 'users' })).toThrowError(
        /DuplicateSchema/
      );
    });
  });

  it('throws NodulusError with code DUPLICATE_SCHEMA on duplicate name', async () => {
    const { NodulusError } = await import('../../src/core/errors.js');
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Schema('SameSchema', { module: 'payments' });

      let caught: any;
      try {
        Schema('SameSchema', { module: 'payments' });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(NodulusError);
      expect(caught?.code).toBe('DUPLICATE_SCHEMA');
    });
  });

  it('does not affect module, controller, service, or repository registration', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Schema('IsolatedSchema', { module: 'payments', library: 'ajv' });

      expect(getActiveRegistry().getAllModules()).toHaveLength(0);
      expect(getActiveRegistry().getAllControllersMetadata()).toHaveLength(0);
      expect(getActiveRegistry().getAllServices()).toHaveLength(0);
      expect(getActiveRegistry().getAllRepositories()).toHaveLength(0);
    });
  });
});
