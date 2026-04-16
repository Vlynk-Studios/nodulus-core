import path from 'node:path';
import { NITS_REGISTRY_VERSION } from './constants.js';
import { hashSimilarity } from './nits-hash.js';
import { generateModuleId } from './nits-id.js';
import type { 
  NitsRegistry, 
  NitsModuleRecord, 
  ReconciliationResult, 
  NitsStatus,
  DiscoveredModule,
  MovedModule
} from '../types/nits.js';

/**
 * Reconciles discovered modules with the persisted NITS registry using the 
 * "Verification Triangle" algorithm.
 * 
 * Step 1 — Match by Path     (maximum confidence)
 * Step 2 — Match by Hash     (high confidence, similarity >= 0.9)
 * Step 3 — Match by Name     (medium confidence, previous record 'stale')
 */
export async function reconcile(
  discovered: DiscoveredModule[],
  previous: NitsRegistry | null,
  cwd: string = process.cwd()
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    confirmed: [],
    moved: [],
    candidates: [],
    stale: [],
    newModules: []
  };

  const prevModules = previous ? Object.values(previous.modules) : [];
  const unmatchedDiscovered = [...discovered];
  const unmatchedPrev = [...prevModules];
  const usedIds = new Set<string>(prevModules.map(m => m.id));
  const timestamp = new Date().toISOString();
  
  const normalize = (p: string) => path.isAbsolute(p) ? path.relative(cwd, p).replace(/\\/g, '/') : p;

  const createRecord = (
    id: string, 
    disc: DiscoveredModule, 
    status: NitsStatus
  ): NitsModuleRecord => ({
    id,
    name: disc.name,
    path: normalize(disc.dirPath),
    domain: disc.domain,
    hash: disc.hash,
    status,
    lastSeen: timestamp,
    identifiers: disc.identifiers
  });

  // STEP 1: Match by Path (Maximum Confidence)
  for (let i = unmatchedDiscovered.length - 1; i >= 0; i--) {
    const disc = unmatchedDiscovered[i];
    const relPath = normalize(disc.dirPath);
    
    const prevIdx = unmatchedPrev.findIndex(p => p.path === relPath);
    if (prevIdx !== -1) {
      const prev = unmatchedPrev[prevIdx];
      
      // LOG BORDER CASE: Name change
      if (prev.name !== disc.name) {
        console.info(`[NITS] Module rename detected: "${prev.name}" -> "${disc.name}" at ${relPath}`);
      }

      // Even if hash changed, if path is same, it's the same module (Confirmed)
      const record = createRecord(prev.id, disc, 'active');
      result.confirmed.push(record);
      
      unmatchedDiscovered.splice(i, 1);
      unmatchedPrev.splice(prevIdx, 1);
    }
  }

  // STEP 2: Match by Hash (High Confidence, Similarity >= 0.9)
  for (let i = unmatchedDiscovered.length - 1; i >= 0; i--) {
    const disc = unmatchedDiscovered[i];
    
    const matchesForThisDisc: { sim: number, idx: number }[] = [];

    for (let j = 0; j < unmatchedPrev.length; j++) {
      const prev = unmatchedPrev[j];
      const sim = hashSimilarity(prev.identifiers, disc.identifiers);
      
      if (sim >= 0.9) {
        matchesForThisDisc.push({ sim, idx: j });
      }
    }

    // DISAMBIGUATION: If multiple records have high similarity, we don't assume (Step 2 Requirement)
    if (matchesForThisDisc.length === 1) {
      const bestMatchIdx = matchesForThisDisc[0].idx;
      const prev = unmatchedPrev[bestMatchIdx];
      const record = createRecord(prev.id, disc, 'moved');
      
      result.moved.push({
        record,
        oldPath: prev.path,
        newPath: normalize(disc.dirPath),
        brokenImports: []
      });

      unmatchedDiscovered.splice(i, 1);
      unmatchedPrev.splice(bestMatchIdx, 1);
    }
  }

  // STEP 3: Match by Name (Medium Confidence)
  for (let i = unmatchedDiscovered.length - 1; i >= 0; i--) {
    const disc = unmatchedDiscovered[i];
    
    // We look for a unique name match in remaining 'stale' records (Step 3 Requirement)
    const matches = unmatchedPrev.filter(p => p.name === disc.name && p.status === 'stale');
    
    if (matches.length === 1) {
      const prev = matches[0];
      const prevIdx = unmatchedPrev.indexOf(prev);
      const record = createRecord(prev.id, disc, 'candidate');
      
      result.candidates.push({
        record,
        oldPath: prev.path,
        newPath: normalize(disc.dirPath),
        brokenImports: []
      });

      unmatchedDiscovered.splice(i, 1);
      unmatchedPrev.splice(prevIdx, 1);
    }
  }

  // FINALIZATION: New Modules & Stale
  for (const disc of unmatchedDiscovered) {
    const id = generateModuleId(usedIds);
    const record = createRecord(id, disc, 'active');
    usedIds.add(id);
    result.newModules.push(record);
  }

  for (const prev of unmatchedPrev) {
    result.stale.push({ ...prev, status: 'stale' });
  }

  return result;
}

/**
 * Applies the reconciliation result to create a new NitsRegistry.
 */
export function buildUpdatedNitsRegistry(
  result: ReconciliationResult, 
  projectName: string
): NitsRegistry {
  const modules: Record<string, NitsModuleRecord> = {};

  const allActive = [
    ...result.confirmed,
    ...result.moved.map(m => m.record),
    ...result.candidates.map(m => m.record),
    ...result.newModules,
    ...result.stale
  ];

  for (const record of allActive) {
    modules[record.id] = record;
  }

  return {
    project: projectName,
    version: NITS_REGISTRY_VERSION,
    lastCheck: new Date().toISOString(),
    modules
  };
}

/**
 * Extracts a clean path -> nitsId mapping from a reconciliation result.
 * Paths are returned as absolute normalized paths.
 */
export function buildNitsIdMap(result: ReconciliationResult, cwd: string): Map<string, string> {
  const mapping = new Map<string, string>();
  
  const allCurrent = [
    ...result.confirmed,
    ...result.moved.map(m => m.record),
    ...result.candidates.map(m => m.record),
    ...result.newModules
  ];

  for (const record of allCurrent) {
    const absPath = path.isAbsolute(record.path) 
      ? record.path 
      : path.resolve(cwd, record.path);
    mapping.set(absPath, record.id);
  }

  return mapping;
}
