import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import { reconcile, buildUpdatedNitsRegistry, buildNitsIdMap } from '../../src/nits/nits-reconciler.js';
import * as nitsHash from '../../src/nits/nits-hash.js';
import { NITS_REGISTRY_VERSION } from '../../src/nits/constants.js';
import type { NitsRegistry, DiscoveredModule } from '../../src/types/nits.js';

vi.mock('../../src/nits/nits-hash.js', async () => {
  const actual = await vi.importActual('../../src/nits/nits-hash.js') as any;
  return {
    ...actual,
    hashSimilarity: vi.fn()
  };
});

describe('NITS Reconciler (Verification Triangle)', () => {
  const cwd = '/project';
  const timestamp = '2024-01-01T00:00:00.000Z';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(timestamp));
  });

  const createEmptyRegistry = (): NitsRegistry => ({
    project: 'test',
    version: NITS_REGISTRY_VERSION,
    lastCheck: '',
    modules: {}
  });

  it('Test: first run (previous = null) → all are newModules with generated IDs', async () => {
    const discovered: DiscoveredModule[] = [
      { name: 'm1', dirPath: '/project/src/m1', identifiers: ['Id1'], hash: 'h1' },
      { name: 'm2', dirPath: '/project/src/m2', identifiers: ['Id2'], hash: 'h2' }
    ];

    const result = await reconcile(discovered, null, cwd);

    expect(result.newModules.length).toBe(2);
    expect(result.newModules[0].id).toMatch(/^mod_[0-9a-f]{8}$/);
    expect(result.newModules[1].id).toMatch(/^mod_[0-9a-f]{8}$/);
    expect(result.newModules[0].id).not.toBe(result.newModules[1].id);
  });

  it('Test: run with no changes → all confirmed', async () => {
    const previous: NitsRegistry = {
      ...createEmptyRegistry(),
      modules: {
        'mod_1': { id: 'mod_1', name: 'users', path: 'src/users', hash: 'h1', status: 'active', lastSeen: '', identifiers: ['Id1'] }
      }
    };

    const discovered: DiscoveredModule[] = [
      { name: 'users', dirPath: '/project/src/users', identifiers: ['Id1'], hash: 'h1' }
    ];

    const result = await reconcile(discovered, previous, cwd);

    expect(result.confirmed.length).toBe(1);
    expect(result.confirmed[0].id).toBe('mod_1');
    expect(result.newModules.length).toBe(0);
  });

  it('Test: moved module (same hash, different path) → moved with oldPath and newPath', async () => {
    const previous: NitsRegistry = {
      ...createEmptyRegistry(),
      modules: {
        'mod_1': { id: 'mod_1', name: 'users', path: 'src/old', hash: 'h1', status: 'active', lastSeen: '', identifiers: ['Id1'] }
      }
    };

    const discovered: DiscoveredModule[] = [
      { name: 'users', dirPath: '/project/src/new', identifiers: ['Id1'], hash: 'h1' }
    ];

    vi.mocked(nitsHash.hashSimilarity).mockReturnValue(1.0);

    const result = await reconcile(discovered, previous, cwd);

    expect(result.moved.length).toBe(1);
    expect(result.moved[0].record.id).toBe('mod_1');
    expect(result.moved[0].oldPath).toBe('src/old');
    expect(result.moved[0].newPath).toBe('src/new');
  });

  it('Test: deleted module → stale, preserved in registry', async () => {
    const previous: NitsRegistry = {
      ...createEmptyRegistry(),
      modules: {
        'mod_gone': { id: 'mod_gone', name: 'gone', path: 'src/gone', hash: 'h1', status: 'active', lastSeen: '', identifiers: [] }
      }
    };

    const result = await reconcile([], previous, cwd);

    expect(result.stale.length).toBe(1);
    expect(result.stale[0].id).toBe('mod_gone');
    expect(result.stale[0].status).toBe('stale');
  });

  it('Test: cloned module → original confirmed, copy in newModules with different ID', async () => {
    const previous: NitsRegistry = {
      ...createEmptyRegistry(),
      modules: {
        'mod_orig': { id: 'mod_orig', name: 'orig', path: 'src/orig', hash: 'h1', status: 'active', lastSeen: '', identifiers: ['Id1'] }
      }
    };

    const discovered: DiscoveredModule[] = [
      { name: 'orig', dirPath: '/project/src/orig', identifiers: ['Id1'], hash: 'h1' }, // Original
      { name: 'copy', dirPath: '/project/src/copy', identifiers: ['Id1'], hash: 'h1' }  // Copy
    ];

    vi.mocked(nitsHash.hashSimilarity).mockReturnValue(1.0);

    const result = await reconcile(discovered, previous, cwd);

    expect(result.confirmed.length).toBe(1);
    expect(result.confirmed[0].id).toBe('mod_orig');
    
    expect(result.newModules.length).toBe(1);
    expect(result.newModules[0].id).not.toBe('mod_orig');
    expect(result.moved.length).toBe(0);
  });

  it('Test: rename from Module("users") to Module("accounts") same path → confirmed, name updated', async () => {
    const previous: NitsRegistry = {
      ...createEmptyRegistry(),
      modules: {
        'mod_1': { id: 'mod_1', name: 'users', path: 'src/users', hash: 'h1', status: 'active', lastSeen: '', identifiers: ['Id1'] }
      }
    };

    const discovered: DiscoveredModule[] = [
      { name: 'accounts', dirPath: '/project/src/users', identifiers: ['Id1'], hash: 'h1' }
    ];

    const result = await reconcile(discovered, previous, cwd);

    expect(result.confirmed.length).toBe(1);
    expect(result.confirmed[0].id).toBe('mod_1');
    expect(result.confirmed[0].name).toBe('accounts');
  });

  it('Test: similar hash on two records → both treated as newModules, no movement assumed', async () => {
    const previous: NitsRegistry = {
      ...createEmptyRegistry(),
      modules: {
        'mod_a': { id: 'mod_a', name: 'a', path: 'p_a', hash: 'h', status: 'stale', lastSeen: '', identifiers: ['common'] },
        'mod_b': { id: 'mod_b', name: 'b', path: 'p_b', hash: 'h', status: 'stale', lastSeen: '', identifiers: ['common'] }
      }
    };

    const discovered: DiscoveredModule[] = [
      { name: 'new', dirPath: '/project/src/new', identifiers: ['common'], hash: 'h' }
    ];

    vi.mocked(nitsHash.hashSimilarity).mockReturnValue(0.95);

    const result = await reconcile(discovered, previous, cwd);

    expect(result.moved.length).toBe(0);
    expect(result.newModules.length).toBe(1);
    expect(result.stale.length).toBe(2);
  });

  it('Step 3: unique match by name in stale records → candidate', async () => {
    const previous: NitsRegistry = {
      ...createEmptyRegistry(),
      modules: {
        'mod_x': { id: 'mod_x', name: 'widget', path: 'src/old-widget', hash: 'h_old', status: 'stale', lastSeen: '', identifiers: [] }
      }
    };

    const discovered: DiscoveredModule[] = [
      { name: 'widget', dirPath: '/project/src/new-widget', identifiers: [], hash: 'h_new' }
    ];

    // No hash similarity → Step 2 skipped
    vi.mocked(nitsHash.hashSimilarity).mockReturnValue(0.1);

    const result = await reconcile(discovered, previous, cwd);

    // Step 3 should match by name on the stale record
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0].record.id).toBe('mod_x');
    expect(result.candidates[0].oldPath).toBe('src/old-widget');
    expect(result.candidates[0].newPath).toBe('src/new-widget');
    expect(result.newModules.length).toBe(0);
  });
});

describe('buildUpdatedNitsRegistry()', () => {
  const makeRecord = (id: string, name: string, status: 'active' | 'moved' | 'candidate' | 'stale' = 'active') => ({
    id,
    name,
    path: `src/${name}`,
    hash: 'h',
    status,
    lastSeen: '',
    identifiers: []
  });

  it('assembles registry containing confirmed, moved, candidates, newModules, and stale', () => {
    const result = {
      confirmed:  [makeRecord('mod_c', 'confirmed')],
      moved:      [{ record: makeRecord('mod_m', 'moved', 'moved'),   oldPath: 'old', newPath: 'new', brokenImports: [] }],
      candidates: [{ record: makeRecord('mod_k', 'candidate', 'candidate'), oldPath: 'old', newPath: 'new', brokenImports: [] }],
      newModules: [makeRecord('mod_n', 'new')],
      stale:      [makeRecord('mod_s', 'gone', 'stale')]
    };

    const registry = buildUpdatedNitsRegistry(result as any, 'my-project');

    expect(registry.project).toBe('my-project');
    expect(Object.keys(registry.modules)).toHaveLength(5);
    expect(registry.modules['mod_c']?.name).toBe('confirmed');
    expect(registry.modules['mod_m']?.status).toBe('moved');
    expect(registry.modules['mod_k']?.status).toBe('candidate');
    expect(registry.modules['mod_n']?.name).toBe('new');
    expect(registry.modules['mod_s']?.status).toBe('stale');
  });
});

describe('buildNitsIdMap()', () => {
  it('extracts a map of absolute paths to IDs', () => {
    const record = { id: 'mod_123', name: 'test', path: 'src/test' };
    const result = {
      confirmed: [record],
      moved: [],
      candidates: [],
      newModules: [],
      stale: []
    };

    const map = buildNitsIdMap(result as any, '/project');
    
    const expectedPath = path.resolve('/project', 'src/test');
    expect(map.get(expectedPath)).toBe('mod_123');
  });
});
