import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { DEFAULT_SIMILARITY_THRESHOLD, MINIMUM_SIMILARITY_THRESHOLD } from './constants.js';

/**
 * Calculates the Jaccard Similarity between two sets of strings.
 * Jaccard Index = (Set A ∩ Set B) / (Set A ∪ Set B)
 */
export function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  
  const intersectionSize = [...setA].filter(x => setB.has(x)).length;
  const unionSize = new Set([...setA, ...setB]).size;
  
  return intersectionSize / unionSize;
}

/**
 * Returns a dynamic threshold based on the number of identifiers.
 * Formula: min(DEFAULT, max(MINIMUM, 1 - 1/n))
 * 
 * - For n=2: 0.5
 * - For n=4: 0.75
 * - For n=10: 0.9
 */
export function getDynamicThreshold(identifierCount: number): number {
  if (identifierCount <= 0) return DEFAULT_SIMILARITY_THRESHOLD;
  
  const formulaValue = 1 - (1 / identifierCount);
  return Math.min(
    DEFAULT_SIMILARITY_THRESHOLD,
    Math.max(MINIMUM_SIMILARITY_THRESHOLD, formulaValue)
  );
}

/**
 * Checks if two sets of identifiers are similar enough to be considered
 * the same identity, using either a fixed or dynamic threshold.
 */
export function areIdentitiesSimilar(
  oldIdentifiers: string[],
  newIdentifiers: string[],
  configThreshold?: number
): { isSimilar: boolean; similarity: number; thresholdUsed: number } {
  if (oldIdentifiers.length === 0 && newIdentifiers.length === 0) {
    return { isSimilar: false, similarity: 1, thresholdUsed: configThreshold ?? getDynamicThreshold(0) };
  }

  const oldSet = new Set(oldIdentifiers);
  const newSet = new Set(newIdentifiers);
  const similarity = calculateJaccardSimilarity(oldSet, newSet);
  
  // Use config override if provided, otherwise use dynamic threshold based on the larger set
  const thresholdUsed = configThreshold ?? getDynamicThreshold(Math.max(oldSet.size, newSet.size));
  
  return {
    isSimilar: similarity >= thresholdUsed,
    similarity,
    thresholdUsed
  };
}
/**
 * Calculates a unique SHA-256 hash for a module based on the content
 * of its source files (.ts, .js, .mts, .mjs).
 * 
 * Excludes tests, hidden files, and type definitions.
 */
export async function calculateModuleHash(dirPath: string): Promise<string> {
  const hash = createHash('sha256');
  
  const files = await fg('**/*.{ts,js,mts,mjs}', {
    cwd: dirPath,
    absolute: true,
    ignore: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts', 'index.*']
  });
  
  // Sort files for deterministic hash
  files.sort();
  
  for (const file of files) {
    // Include filename to distinguish between identity-identical content in different structures
    hash.update(path.basename(file));
    
    const content = fs.readFileSync(file);
    hash.update(content);
  }
  
  return hash.digest('hex');
}
