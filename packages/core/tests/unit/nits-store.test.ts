import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadNitsRegistry, saveNitsRegistry } from '../../src/nits/nits-store.js';
import { NITS_REGISTRY_VERSION } from '../../src/nits/constants.js';
import fs from 'node:fs';

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    promises: {
      readFile: vi.fn()
    }
  }
}));

describe('NITS Store', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null if file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const registry = await loadNitsRegistry('/mock');
    expect(registry).toBeNull();
  });

  it('should load registry from .nodulus/registry.json by default', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify({
      project: 'test',
      version: NITS_REGISTRY_VERSION,
      lastCheck: '2021-01-01',
      modules: {}
    }));
    
    const registry = await loadNitsRegistry('/mock');
    expect(registry).not.toBeNull();
    expect(registry?.project).toBe('test');
  });

  it('should save the registry securely', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    saveNitsRegistry('/mock', { project: 'test', lastCheck: '', version: '1.0', modules: {} });
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
