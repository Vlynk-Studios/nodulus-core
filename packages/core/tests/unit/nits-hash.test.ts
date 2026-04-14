import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  calculateJaccardSimilarity,
  getDynamicThreshold,
  areIdentitiesSimilar,
  computeModuleHash,
  hashSimilarity
} from '../../src/nits/nits-hash.js';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function write(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
}

// ─────────────────────────────────────────────
// hashSimilarity (Jaccard wrapper)
// ─────────────────────────────────────────────

describe('hashSimilarity', () => {
  it('returns 1.0 for identical sets', () => {
    expect(hashSimilarity(['A', 'B', 'C'], ['A', 'B', 'C'])).toBe(1);
  });

  it('returns 0.0 for completely disjoint sets', () => {
    expect(hashSimilarity(['A', 'B'], ['C', 'D'])).toBe(0);
  });

  it('returns ~0.67 for sets with one extra element', () => {
    // {A,B,C} vs {A,B} → intersection=2, union=3 → 2/3 ≈ 0.667
    expect(hashSimilarity(['A', 'B', 'C'], ['A', 'B'])).toBeCloseTo(0.67, 2);
  });

  it('returns 0.5 for sets with one substitution', () => {
    // {A,B,C} vs {A,B,D} → intersection=2, union=4 → 0.5
    expect(hashSimilarity(['A', 'B', 'C'], ['A', 'B', 'D'])).toBe(0.5);
  });

  it('returns 1.0 when both sets are empty (N-30 — edge case)', () => {
    // Two empty modules must NOT be treated as the same identity.
    // This test documents the raw Jaccard behavior — areIdentitiesSimilar
    // must guard against this case separately.
    expect(calculateJaccardSimilarity(new Set(), new Set())).toBe(1);
  });

  it('is order-independent', () => {
    expect(hashSimilarity(['C', 'A', 'B'], ['B', 'C', 'A'])).toBe(1);
  });

  it('is symmetric', () => {
    const ab = hashSimilarity(['A', 'B', 'C'], ['A', 'D']);
    const ba = hashSimilarity(['A', 'D'], ['A', 'B', 'C']);
    expect(ab).toBe(ba);
  });

  it('handles single-element sets correctly', () => {
    expect(hashSimilarity(['A'], ['A'])).toBe(1);
    expect(hashSimilarity(['A'], ['B'])).toBe(0);
  });

  it('ignores duplicate entries within the same array', () => {
    // Sets deduplicate — ['A','A','B'] is treated as ['A','B']
    expect(hashSimilarity(['A', 'A', 'B'], ['A', 'B'])).toBe(1);
  });
});

// ─────────────────────────────────────────────
// getDynamicThreshold
// ─────────────────────────────────────────────

describe('getDynamicThreshold', () => {
  it('returns DEFAULT_SIMILARITY_THRESHOLD for n=0 (no identifiers)', () => {
    // When there are no identifiers we fall back to the default, not 0
    expect(getDynamicThreshold(0)).toBeGreaterThan(0);
  });

  it('returns 0.5 for n=2', () => {
    expect(getDynamicThreshold(2)).toBe(0.5);
  });

  it('returns 0.75 for n=4', () => {
    expect(getDynamicThreshold(4)).toBe(0.75);
  });

  it('returns 0.9 for n=10 (ceiling)', () => {
    expect(getDynamicThreshold(10)).toBe(0.9);
  });

  it('never exceeds DEFAULT_SIMILARITY_THRESHOLD regardless of n', () => {
    expect(getDynamicThreshold(100)).toBeLessThanOrEqual(0.9);
    expect(getDynamicThreshold(1000)).toBeLessThanOrEqual(0.9);
  });

  it('never falls below MINIMUM_SIMILARITY_THRESHOLD', () => {
    // n=1 → 1 - 1/1 = 0, but floor is 0.5
    expect(getDynamicThreshold(1)).toBeGreaterThanOrEqual(0.5);
  });
});

// ─────────────────────────────────────────────
// areIdentitiesSimilar
// ─────────────────────────────────────────────

describe('areIdentitiesSimilar', () => {
  it('returns isSimilar: true for identical identifiers', () => {
    const result = areIdentitiesSimilar(['UserService', 'UserRepository'], ['UserService', 'UserRepository']);
    expect(result.isSimilar).toBe(true);
    expect(result.similarity).toBe(1);
  });

  it('returns isSimilar: false for completely different identifiers', () => {
    const result = areIdentitiesSimilar(['UserService'], ['OrderService']);
    expect(result.isSimilar).toBe(false);
    expect(result.similarity).toBe(0);
  });

  it('uses configThreshold when provided', () => {
    // similarity = 0.5, threshold forced to 0.4 → should match
    const loose = areIdentitiesSimilar(['A', 'B', 'C'], ['A', 'B', 'D'], 0.4);
    expect(loose.isSimilar).toBe(true);
    expect(loose.thresholdUsed).toBe(0.4);

    // same similarity but threshold forced to 0.6 → should not match
    const strict = areIdentitiesSimilar(['A', 'B', 'C'], ['A', 'B', 'D'], 0.6);
    expect(strict.isSimilar).toBe(false);
    expect(strict.thresholdUsed).toBe(0.6);
  });

  it('uses dynamic threshold when no configThreshold is provided', () => {
    const result = areIdentitiesSimilar(['A', 'B'], ['A', 'B', 'C']);
    // similarity = 2/3 ≈ 0.67, dynamic threshold for n=3 = 1 - 1/3 = 0.67
    expect(result.thresholdUsed).toBeGreaterThan(0);
    expect(result.thresholdUsed).toBeLessThanOrEqual(0.9);
  });

  // N-30: Two modules with no identifiers must NOT be treated as the same identity
  it('returns isSimilar: false when both arrays are empty (N-30)', () => {
    const result = areIdentitiesSimilar([], []);
    expect(result.isSimilar).toBe(false);
  });

  it('returns isSimilar: false when one array is empty', () => {
    const result = areIdentitiesSimilar(['UserService'], []);
    expect(result.isSimilar).toBe(false);
  });

  it('exposes thresholdUsed in the result', () => {
    const result = areIdentitiesSimilar(['A'], ['A'], 0.7);
    expect(result).toHaveProperty('thresholdUsed', 0.7);
  });
});

// ─────────────────────────────────────────────
// computeModuleHash (Semantic)
// ─────────────────────────────────────────────

describe('computeModuleHash', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-nits-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('produces a 10-character hash', async () => {
    write(tmpDir, 'service.ts', "Service('users', {})");
    const { hash } = await computeModuleHash(tmpDir);
    expect(hash).toHaveLength(10);
  });

  it('is deterministic — same content produces same hash', async () => {
    write(tmpDir, 'service.ts', "Service('users', {})");
    const { hash: h1 } = await computeModuleHash(tmpDir);
    const { hash: h2 } = await computeModuleHash(tmpDir);
    expect(h1).toBe(h2);
  });

  it('is semantic — comments and whitespace do not change the hash', async () => {
    write(tmpDir, 'mod.ts', "Service('users', {})");
    const { hash: h1 } = await computeModuleHash(tmpDir);

    write(tmpDir, 'mod.ts', "// comment\nService('users', {})\n\n   ");
    const { hash: h2 } = await computeModuleHash(tmpDir);

    expect(h1).toBe(h2);
  });

  it('is semantic — moving a file within the module does not change the hash', async () => {
    const subDir = path.join(tmpDir, 'sub');
    fs.mkdirSync(subDir);
    write(subDir, 'logic.ts', "Service('shared', {})");
    const { hash: h1 } = await computeModuleHash(tmpDir);

    fs.rmSync(subDir, { recursive: true });
    write(tmpDir, 'logic.ts', "Service('shared', {})");
    const { hash: h2 } = await computeModuleHash(tmpDir);

    expect(h1).toBe(h2);
  });

  it('changes hash when an identifier is added', async () => {
    write(tmpDir, 'service.ts', "Service('UserService', {})");
    const { hash: h1 } = await computeModuleHash(tmpDir);

    write(tmpDir, 'repo.ts', "Repository('UserRepository', {})");
    const { hash: h2 } = await computeModuleHash(tmpDir);

    expect(h1).not.toBe(h2);
  });

  it('changes hash when an identifier is renamed', async () => {
    write(tmpDir, 'service.ts', "Service('UserService', {})");
    const { hash: h1 } = await computeModuleHash(tmpDir);

    write(tmpDir, 'service.ts', "Service('AccountService', {})");
    const { hash: h2 } = await computeModuleHash(tmpDir);

    expect(h1).not.toBe(h2);
  });

  it('exposes identifiers alongside the hash', async () => {
    write(tmpDir, 'service.ts', "Service('UserService', {})");
    write(tmpDir, 'repo.ts', "Repository('UserRepository', {})");
    const { identifiers } = await computeModuleHash(tmpDir);

    expect(identifiers).toContain('UserService');
    expect(identifiers).toContain('UserRepository');
  });

  it('uses filename as fallback when no identifiers are found', async () => {
    write(tmpDir, 'plain.ts', "// no nodulus calls here");
    const { hash: h1 } = await computeModuleHash(tmpDir);
    expect(h1).toHaveLength(10);

    // Renaming the file should change the hash in fallback mode
    fs.renameSync(path.join(tmpDir, 'plain.ts'), path.join(tmpDir, 'renamed.ts'));
    const { hash: h2 } = await computeModuleHash(tmpDir);
    expect(h1).not.toBe(h2);
  });

  it('mixed files — only uses identifiers from files that have them', async () => {
    write(tmpDir, 'service.ts', "Service('UserService', {})");
    write(tmpDir, 'utils.ts', "// helper file with no identifiers");
    const { hash: h1, identifiers } = await computeModuleHash(tmpDir);

    // Hash should be driven by the identifier, not the plain file
    write(tmpDir, 'utils.ts', "// completely different comment");
    const { hash: h2 } = await computeModuleHash(tmpDir);

    expect(h1).toBe(h2);
    expect(identifiers).toContain('UserService');
    expect(identifiers).not.toContain('utils');
  });

  it('returns stable hash for empty directory', async () => {
    const { hash } = await computeModuleHash(tmpDir);
    expect(hash).toHaveLength(10);
  });
});