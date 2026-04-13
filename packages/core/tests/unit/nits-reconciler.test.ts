import { describe, it, expect } from 'vitest';
import { reconcile } from '../../src/nits/nits-reconciler.js';
import type { ModuleGraph } from '../../src/cli/lib/graph-builder.js';
import type { NitsRegistry } from '../../src/types/nits.js';

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

    expect(registry.modules['src/modules/users']).toBeDefined();
    expect(registry.modules['src/modules/users'].id).toMatch(/^mod_[0-9a-f]{8}$/);
    expect(registry.modules['src/modules/users'].path).toBe('src/modules/users');
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
        'src/modules/users': { id: oldId, path: 'src/modules/users', identifiers: ['UserService'] }
      } 
    };

    const { registry, summary } = reconcile(graph, oldRegistry, cwd);

    expect(registry.modules['src/modules/users'].id).toBe(oldId);
    expect(summary.newModules).toBe(0);
  });

  it('matches a moved module via similarity (Identity Persistence)', () => {
    const oldId = 'mod_moved_1';
    // Old registry says 'users' was at 'src/modules/users'
    const oldRegistry: NitsRegistry = { 
      version: '1.0.0', 
      modules: {
        'src/modules/users': { id: oldId, path: 'src/modules/users', identifiers: ['UserService', 'UserRepo', 'UserSchema', 'UserValidator'] }
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

    expect(registry.modules['src/modules/auth'].id).toBe(oldId);
    expect(registry.modules['src/modules/auth'].path).toBe('src/modules/auth');
    expect(summary.movedModules).toBe(1);
  });

  it('heals ID conflicts (duplicate IDs from merge)', () => {
    const duplicateId = 'mod_conflict';
    const oldRegistry: NitsRegistry = { 
      version: '1.0.0', 
      modules: {
        'src/modules/mod-a': { id: duplicateId, path: 'src/modules/mod-a', identifiers: ['A'] },
        'src/modules/mod-b': { id: duplicateId, path: 'src/modules/mod-b', identifiers: ['B'] }
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

    const idA = registry.modules['src/modules/mod-a'].id;
    const idB = registry.modules['src/modules/mod-b'].id;

    expect(idA).not.toBe(idB);
    expect(summary.healedConflicts).toBe(1);
    // One of them kept the ID, the other got a new one
    expect([idA, idB]).toContain(duplicateId);
  });

  it('heals ID conflicts during similarity matching (Step 2)', () => {
    const duplicateId = 'mod_sim_conflict';
    const oldRegistry: NitsRegistry = { 
      version: '1.0.0', 
      modules: {
        'src/modules/old-a': { id: duplicateId, path: 'src/modules/old-a', identifiers: ['ServiceA', 'ServiceB'] },
        'src/modules/old-b': { id: duplicateId, path: 'src/modules/old-b', identifiers: ['ServiceC', 'ServiceD'] }
      } 
    };

    // New paths don't match, forcing similarity match
    const graph: ModuleGraph = {
      domains: [],
      modules: [
        { name: 'new-a', dirPath: '/project/src/modules/new-a', indexPath: '', declaredImports: [], actualImports: [], internalIdentifiers: ['ServiceA', 'ServiceB'] },
        { name: 'new-b', dirPath: '/project/src/modules/new-b', indexPath: '', declaredImports: [], actualImports: [], internalIdentifiers: ['ServiceC', 'ServiceD'] }
      ]
    };

    const { registry, summary } = reconcile(graph, oldRegistry, cwd);

    const idA = registry.modules['src/modules/new-a'].id;
    const idB = registry.modules['src/modules/new-b'].id;

    expect(idA).not.toBe(idB);
    expect(summary.healedConflicts).toBe(1);
    expect(summary.movedModules).toBe(2);
  });

  it('DOES NOT match modules when internalIdentifiers is entirely empty for both (False Positive Guard)', () => {
    const emptyId = 'mod_empty';
    const oldRegistry: NitsRegistry = { 
      version: '1.0.0', 
      modules: {
        'src/modules/old-users': { id: emptyId, path: 'src/modules/old-users', identifiers: [] }
      } 
    };

    const graph: ModuleGraph = {
      domains: [],
      modules: [
        { name: 'new-users', dirPath: '/project/src/modules/new-users', indexPath: '', declaredImports: [], actualImports: [], internalIdentifiers: [] }
      ]
    };

    const { registry, summary } = reconcile(graph, oldRegistry, cwd);

    // As of 1.4.0, two empty modules are no longer considered highly similar
    expect(registry.modules['src/modules/new-users'].id).not.toBe(emptyId);
    expect(summary.movedModules).toBe(0);
    expect(summary.newModules).toBe(1);
  });
});
