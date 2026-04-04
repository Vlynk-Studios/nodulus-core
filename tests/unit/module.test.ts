import { describe, it, expect, vi } from 'vitest';
import { Module } from '../../src/identifiers/module.js';
import { createRegistry, registryContext, getActiveRegistry } from '../../src/core/registry.js';
import { NodulusError } from '../../src/core/errors.js';

describe('Identifier: Module() V0.4.0', () => {
  it('registers the module in the registry', async () => {
    const r = createRegistry();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await registryContext.run(r, async () => {
      // The folder name containing this test is 'unit', so calling it 'unit' prevents warnings
      Module('unit', { imports: [], exports: ['API'] });

      expect(getActiveRegistry().hasModule('unit')).toBe(true);
      const mod = getActiveRegistry().getModule('unit');
      expect(mod?.exports).toEqual(['API']);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    warnSpy.mockRestore();
  });

  it('emits a warning if name does not match the containing folder', async () => {
    const r = createRegistry();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await registryContext.run(r, async () => {
      // containing folder is 'unit'
      Module('users', {});

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Nodulus] Warning: Module name "users" does not match its containing folder "unit".')
      );
    });

    warnSpy.mockRestore();
  });

  it('calling Module() with the same name twice throws DUPLICATE_MODULE', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      Module('unit', {});

      expect(() => Module('unit', {})).toThrowError(NodulusError);
      try {
        Module('unit', {});
      } catch (err: any) {
        expect(err.code).toBe('DUPLICATE_MODULE');
      }
    });
  });

  it('calling Module() with a non-string name throws TypeError', async () => {
    const r = createRegistry();
    await registryContext.run(r, async () => {
      // @ts-expect-error Testing invalid runtime input
      expect(() => Module(123)).toThrowError(TypeError);
      // @ts-expect-error Testing invalid runtime input
      expect(() => Module(123)).toThrowError('Module name must be a string, received number');
    });
  });
});
