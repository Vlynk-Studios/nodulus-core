import { describe, it, expect } from 'vitest';
import { reconcile } from '../../src/nits/nits-reconciler.js';
import type { ModuleGraph } from '../../src/cli/lib/graph-builder.js';
import type { NitsRegistry } from '../../src/nits/nits-store.js';

describe('NITS Reconciler', () => {
  const cwd = '/project';

  it('assigns new IDs to brand new modules', () => {
    const graph: ModuleGraph = {
      domains: [],
      modules: [
        { name: 'users', dirPath: '/project/src/modules/users', indexPath: '', declaredImports: [], actualImports: [], internalIdentifiers: ['UserService'] }
      ]
    };
    const oldRegistry: NitsRegistry = { version: '1.0.0', modules: {} };

    const { registry, summary } = reconcile(graph, oldRegistry, cwd);

    expect(registry.modules['users']).toBeDefined();
    expect(registry.modules['users'].id).toMatch(/^mod_[0-9a-f]{8}$/);
    expect(registry.modules['users'].path).toBe('src/modules/users');
    expect(summary.newModules).toBe(1);
  });

  it('keeps the same ID for an existing module with same path', () => {
    const oldId = 'mod_12345678';
    const graph: ModuleGraph = {
      domains: [],
      modules: [
        { name: 'users', dirPath: '/project/src/modules/users', indexPath: '', declaredImports: [], actualImports: [], internalIdentifiers: ['UserService'] }
      ]
    };
    const oldRegistry: NitsRegistry = { 
      version: '1.0.0', 
      modules: {
        'users': { id: oldId, path: 'src/modules/users', identifiers: ['UserService'] }
      } 
    };

    const { registry, summary } = reconcile(graph, oldRegistry, cwd);

    expect(registry.modules['users'].id).toBe(oldId);
    expect(summary.newModules).toBe(0);
  });

  it('matches a moved module via similarity (Identity Persistence)', () => {
    const oldId = 'mod_moved_1';
    // Old registry says 'users' was at 'src/modules/users'
    const oldRegistry: NitsRegistry = { 
      version: '1.0.0', 
      modules: {
        'users': { id: oldId, path: 'src/modules/users', identifiers: ['UserService', 'UserRepo', 'UserSchema', 'UserValidator'] }
      } 
    };

    // New graph says 'auth' is at 'src/modules/auth' and has SAME identifiers (Pure Move)
    const graph: ModuleGraph = {
      domains: [],
      modules: [
        { name: 'new-auth', dirPath: '/project/src/modules/auth', indexPath: '', declaredImports: [], actualImports: [], internalIdentifiers: ['UserService', 'UserRepo', 'UserSchema', 'UserValidator'] }
      ]
    };

    const { registry, summary } = reconcile(graph, oldRegistry, cwd);

    expect(registry.modules['new-auth'].id).toBe(oldId);
    expect(registry.modules['new-auth'].path).toBe('src/modules/auth');
    expect(summary.movedModules).toBe(1);
  });

  it('heals ID conflicts (duplicate IDs from merge)', () => {
    const duplicateId = 'mod_conflict';
    const oldRegistry: NitsRegistry = { 
      version: '1.0.0', 
      modules: {
        'mod-a': { id: duplicateId, path: 'src/modules/mod-a', identifiers: ['A'] },
        'mod-b': { id: duplicateId, path: 'src/modules/mod-b', identifiers: ['B'] }
      } 
    };

    const graph: ModuleGraph = {
      domains: [],
      modules: [
        { name: 'mod-a', dirPath: '/project/src/modules/mod-a', indexPath: '', declaredImports: [], actualImports: [], internalIdentifiers: ['A'] },
        { name: 'mod-b', dirPath: '/project/src/modules/mod-b', indexPath: '', declaredImports: [], actualImports: [], internalIdentifiers: ['B'] }
      ]
    };

    const { registry, summary } = reconcile(graph, oldRegistry, cwd);

    const idA = registry.modules['mod-a'].id;
    const idB = registry.modules['mod-b'].id;

    expect(idA).not.toBe(idB);
    expect(summary.healedConflicts).toBe(1);
    // One of them kept the ID, the other got a new one
    expect([idA, idB]).toContain(duplicateId);
  });
});
