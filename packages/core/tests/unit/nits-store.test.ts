import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadNitsRegistry, saveNitsRegistry } from '../../src/nits/nits-store.js';
import { NITS_REGISTRY_VERSION } from '../../src/nits/constants.js';
import fs from 'node:fs';

vi.mock('node:fs');

describe('NITS Store', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load a fresh registry if file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const registry = loadNitsRegistry('/mock', 'registry.json');
    expect(registry.version).toBe(NITS_REGISTRY_VERSION);
    expect(registry.modules).toEqual({});
  });

  it('should save the registry securely', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    saveNitsRegistry('/mock', { version: '1.0', modules: {} }, 'registry.json');
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
