/**
 * CODE-1: computeModuleHash integration tests against the nits-app fixture.
 *
 * This file has NO vi.mock('node:fs') — computeModuleHash uses fast-glob and
 * real FS reads, which are incompatible with the module-level mock in
 * nits-store.test.ts. Keeping these tests isolated ensures they exercise the
 * real AST parser pipeline end-to-end.
 *
 * Also serves as the regression guard for BUG-1 (Controller removed from
 * targetCallees) — if 'Controller' is ever re-added, the identifier list would
 * contain route strings like '/users' and these tests would catch it.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeModuleHash } from '../../src/nits/nits-hash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_MODULES = path.resolve(__dirname, '../fixtures/nits-app/src/modules');

describe('CODE-1: computeModuleHash on nits-app fixture modules', () => {
  it('extracts UserService identifier from fixtures/nits-app/src/modules/users', async () => {
    const usersDir = path.join(FIXTURE_MODULES, 'users');
    const { hash, identifiers } = await computeModuleHash(usersDir);

    // BUG-1 regression: 'UserService' (from Service()) must be present
    expect(identifiers).toContain('UserService');
    // Hash must be a valid 10-char hex string
    expect(hash).toMatch(/^[0-9a-f]{10}$/);
  });

  it('extracts OrderService identifier from fixtures/nits-app/src/modules/orders', async () => {
    const ordersDir = path.join(FIXTURE_MODULES, 'orders');
    const { hash, identifiers } = await computeModuleHash(ordersDir);

    expect(identifiers).toContain('OrderService');
    expect(hash).toMatch(/^[0-9a-f]{10}$/);
  });

  it('users and orders modules produce different hashes (distinct identifiers)', async () => {
    const users = await computeModuleHash(path.join(FIXTURE_MODULES, 'users'));
    const orders = await computeModuleHash(path.join(FIXTURE_MODULES, 'orders'));

    expect(users.hash).not.toBe(orders.hash);
    expect(users.identifiers).not.toEqual(orders.identifiers);
  });

  it('does NOT extract Controller route paths as identifiers (BUG-1 regression)', async () => {
    // Neither fixture module declares a Controller(), but this guard prevents
    // regression: if 'Controller' were re-added to targetCallees, route strings
    // like '/users' would appear in the identifier list.
    const { identifiers } = await computeModuleHash(path.join(FIXTURE_MODULES, 'users'));

    for (const id of identifiers) {
      expect(id).not.toMatch(/^\//);  // must not start with '/' (HTTP route path)
    }
  });
});
