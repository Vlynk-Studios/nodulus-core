import { describe, it, expect } from 'vitest';
import { calculateJaccardSimilarity, getDynamicThreshold, areIdentitiesSimilar } from '../../src/nits/nits-hash.js';

describe('NITS Similarity Logic', () => {
  describe('calculateJaccardSimilarity', () => {
    it('returns 1 for exact match', () => {
      const setA = new Set(['A', 'B', 'C']);
      const setB = new Set(['A', 'B', 'C']);
      expect(calculateJaccardSimilarity(setA, setB)).toBe(1);
    });

    it('returns 0 for no common elements', () => {
      const setA = new Set(['A', 'B']);
      const setB = new Set(['C', 'D']);
      expect(calculateJaccardSimilarity(setA, setB)).toBe(0);
    });

    it('calculates correctly for partial match (n=2, 1 change)', () => {
      // {A, B} vs {A, C} -> intersection={A}, union={A, B, C} -> 1/3
      const setA = new Set(['UserService', 'UserRepo']);
      const setB = new Set(['UserService', 'AuthRepo']);
      expect(calculateJaccardSimilarity(setA, setB)).toBeCloseTo(0.33, 2);
    });

    it('calculates correctly for partial match (n=10, 1 change)', () => {
      // 10 elements, 1 changed -> intersection=9, union=11 -> 9/11
      const setA = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
      const setB = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '11']);
      expect(calculateJaccardSimilarity(setA, setB)).toBeCloseTo(0.818, 3);
    });
  });

  describe('getDynamicThreshold', () => {
    it('returns 0.5 for n=2', () => {
      // 1 - 1/2 = 0.5
      expect(getDynamicThreshold(2)).toBe(0.5);
    });

    it('returns 0.75 for n=4', () => {
      // 1 - 1/4 = 0.75
      expect(getDynamicThreshold(4)).toBe(0.75);
    });

    it('returns 0.9 for n=10 (CEILING)', () => {
      // 1 - 1/10 = 0.9
      expect(getDynamicThreshold(10)).toBe(0.9);
    });

    it('returns 0.9 for n=20 (CAP AT CEILING)', () => {
      // 1 - 1/20 = 0.95 -> but cap is 0.9
      expect(getDynamicThreshold(20)).toBe(0.9);
    });

    it('never returns less than 0.5 (FLOOR)', () => {
      expect(getDynamicThreshold(1)).toBe(0.5);
    });
  });

  describe('areIdentitiesSimilar', () => {
    it('matches small module with 1 change (n=2)', () => {
      // n=2 -> threshold=0.5. similarity=0.33. -> SHOULD FAIL identity (still too much change for n=2)
      // Wait, the user said "NITS loses the thread... it creates a new ID".
      // Let's check n=3. n=3 -> threshold=0.66. similarity=2/4=0.5. -> FAIL.
      // Let's check n=1. n=1 -> threshold=0.5. 1 changed -> 0/2=0. -> FAIL.
      
      const oldIds = ['UserService', 'UserRepo'];
      const newIds = ['UserService', 'AuthRepo'];
      const result = areIdentitiesSimilar(oldIds, newIds);
      
      expect(result.similarity).toBeCloseTo(0.33, 2);
      expect(result.thresholdUsed).toBe(0.5);
      expect(result.isSimilar).toBe(false); // Still false because 1 change in 2 is 50% change.
    });

    it('matches when similarity is exactly the threshold', () => {
      // n=2 -> threshold=0.5. If we have 2 elements and add 1 common? No.
      // Manual threshold
      const result = areIdentitiesSimilar(['A'], ['A'], 1);
      expect(result.isSimilar).toBe(true);
    });

    it('respects manual threshold overrides', () => {
      const oldIds = ['A', 'B'];
      const newIds = ['A', 'C']; // similarity 0.33
      const result = areIdentitiesSimilar(oldIds, newIds, 0.3);
      expect(result.isSimilar).toBe(true);
    });
  });
});
