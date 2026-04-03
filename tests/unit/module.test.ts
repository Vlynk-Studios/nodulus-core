import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Module } from '../../src/identifiers/module.js';
import { registry } from '../../src/core/registry.js';
import { NodulusError } from '../../src/core/errors.js';

describe('Identifier: Module() V0.4.0', () => {
  let warnSpy: any;

  beforeEach(() => {
    registry.clearRegistry();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('registers the module in the registry', () => {
    // The folder name containing this test is 'unit', so calling it 'unit' prevents warnings
    Module('unit', { imports: [], exports: ['API'] });

    expect(registry.hasModule('unit')).toBe(true);
    const mod = registry.getModule('unit');
    expect(mod?.exports).toEqual(['API']);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('emits a warning if name does not match the containing folder', () => {
    // containing folder is 'unit'
    Module('users', {});

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Nodulus] Warning: Module name "users" does not match its containing folder "unit".')
    );
  });

  it('calling Module() with the same name twice throws DUPLICATE_MODULE', () => {
    Module('unit', {});
    
    expect(() => Module('unit', {})).toThrowError(NodulusError);
    try {
      Module('unit', {});
    } catch (err: any) {
      expect(err.code).toBe('DUPLICATE_MODULE');
    }
  });

  it('calling Module() with a non-string name throws TypeError', () => {
    // @ts-expect-error Testing invalid runtime input
    expect(() => Module(123)).toThrowError(TypeError);
    // @ts-expect-error Testing invalid runtime input
    expect(() => Module(123)).toThrowError('Module name must be a string, received number');
  });
});
