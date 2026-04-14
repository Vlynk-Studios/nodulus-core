import { describe, it, expect, vi } from 'vitest';
import { reconcile } from '../../src/nits/nits-reconciler.js';
import * as nitsHash from '../../src/nits/nits-hash.js';
import type { ModuleGraph } from '../../src/cli/lib/graph-builder.js';
import type { NitsRegistry } from '../../src/types/nits.js';

vi.mock('../../src/nits/nits-hash.js', async () => {
  const actual = await vi.importActual('../../src/nits/nits-hash.js') as any;
  return {
    ...actual,
    calculateModuleHash: vi.fn(async () => 'mock-hash')
  };
});

describe('NITS Reconciler (Identity-First)', () => {
  const cwd = '/project';

  it('assigns new IDs indexable by ID', async () => {
    const graph: ModuleGraph = {
      domains: [],
      modules: [
        { name: 'users', dirPath: '/project/src/modules/users', indexPath: '', declaredImports: [], actualImports: [], internalIdentifiers: ['UserService'] }
      ]
    };
    const oldRegistry: NitsRegistry = { project: 'test', version: '1.0.0', lastCheck: '', modules: {} };

    const { registry, result } = await reconcile(graph, oldRegistry, cwd);

    const ids = Object.keys(registry.modules);
    expect(ids.length).toBe(1);
    expect(ids[0]).toMatch(/^mod_[0-9a-f]{8}$/);
    
    const record = registry.modules[ids[0]];
    expect(record.path).toBe('src/modules/users');
    expect(result.newModules.length).toBe(1);
  });

  it('detects a moved module via content hash', async () => {
    const oldId = 'mod_12345678';
    const sharedHash = 'same-code-signature';
    
    vi.mocked(nitsHash.calculateModuleHash).mockResolvedValue(sharedHash);

    const oldRegistry: NitsRegistry = { 
      project: 'test',
      version: '1.0.0',
      lastCheck: '',
      modules: {
        [oldId]: { 
          id: oldId, 
          name: 'users', 
          path: 'src/modules/old-path', 
          hash: sharedHash, 
          status: 'active', 
          lastSeen: '', 
          identifiers: [] 
        }
      } 
    };

    const graph: ModuleGraph = {
      domains: [],
      modules: [
        { name: 'users', dirPath: '/project/src/modules/new-path', indexPath: '', declaredImports: [], actualImports: [], internalIdentifiers: [] }
      ]
    };

    const { registry, result } = await reconcile(graph, oldRegistry, cwd);

    expect(registry.modules[oldId]).toBeDefined();
    expect(registry.modules[oldId].path).toBe('src/modules/new-path');
    expect(registry.modules[oldId].status).toBe('moved');
    expect(result.moved.length).toBe(1);
  });

  it('marks missing modules as stale', async () => {
    const staleId = 'mod_gone';
    const oldRegistry: NitsRegistry = { 
      project: 'test',
      version: '1.0.0',
      lastCheck: '',
      modules: {
        [staleId]: { 
          id: staleId, 
          name: 'deleted', 
          path: 'src/modules/deleted', 
          hash: 'abc', 
          status: 'active', 
          lastSeen: '', 
          identifiers: [] 
        }
      } 
    };

    const graph: ModuleGraph = { domains: [], modules: [] };
    const { registry, result } = await reconcile(graph, oldRegistry, cwd);

    expect(registry.modules[staleId].status).toBe('stale');
    expect(result.stale.length).toBe(1);
  });
});
