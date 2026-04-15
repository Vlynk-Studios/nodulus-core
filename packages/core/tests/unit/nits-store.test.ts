import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadNitsRegistry, saveNitsRegistry, initNitsRegistry, inferProjectName } from '../../src/nits/nits-store.js';
import { NITS_REGISTRY_VERSION } from '../../src/nits/constants.js';
import fs from 'node:fs';

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn()
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

  it('should save the registry securely', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    await saveNitsRegistry({ project: 'test', lastCheck: '', version: '1.0', modules: {} }, '/mock');
    expect(fs.promises.writeFile).toHaveBeenCalled();
  });

  describe('Metadata Helpers', () => {
    it('should infer project name from package.json', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'my-project' }));
      
      const name = inferProjectName('/mock');
      expect(name).toBe('my-project');
    });

    it('should fallback to unknown if package.json is missing or unnamed', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(inferProjectName('/mock')).toBe('unknown');
    });

    it('should initialize a valid empty registry', () => {
      const registry = initNitsRegistry('my-app');
      expect(registry.project).toBe('my-app');
      expect(registry.version).toBe(NITS_REGISTRY_VERSION);
      expect(registry.modules).toEqual({});
    });
  });
});
