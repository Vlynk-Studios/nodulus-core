import path from 'node:path';
import { NITS_REGISTRY_VERSION } from './constants.js';
import { areIdentitiesSimilar, computeModuleHash } from './nits-hash.js';
import { generateModuleId } from './nits-id.js';
import type { ModuleGraph } from '../cli/lib/graph-builder.js';
import type { 
  NitsRegistry, 
  NitsModuleRecord, 
  ReconciliationResult, 
  NitsStatus 
} from '../types/nits.js';

/**
 * Reconciles the current module graph with the persisted NITS registry.
 * 
 * Strategy (Identity-First):
 * 1. Match by ID (if available in graph).
 * 2. Match by Content Hash (priority for moves).
 * 3. Match by Identity Similarity (Jaccard on identifiers).
 * 4. Assign new IDs for brand new stuff.
 * 5. Track stale modules (missing on disk).
 */
export async function reconcile(
  graph: ModuleGraph, 
  oldRegistry: NitsRegistry, 
  cwd: string,
  configThreshold?: number
): Promise<{ registry: NitsRegistry; result: ReconciliationResult }> {
  const newModulesRecord: Record<string, NitsModuleRecord> = {};
  const result: ReconciliationResult = {
    confirmed: [],
    moved: [],
    stale: [],
    newModules: []
  };

  const oldEntries = Object.values(oldRegistry.modules);
  const usedIds = new Set<string>();
  const unmatchedNodes = [...graph.modules];
  const timestamp = new Date().toISOString();
  
  const normalize = (p: string) => path.relative(cwd, p).replace(/\\/g, '/');

  // Helper to create a record
  const createRecord = (
    id: string, 
    name: string, 
    relPath: string, 
    hash: string, 
    status: NitsStatus,
    identifiers: string[]
  ): NitsModuleRecord => ({
    id,
    name,
    path: relPath,
    hash,
    status,
    lastSeen: timestamp,
    identifiers
  });

  // STEP 1: Process modules (Exact Path + Content match)
  const processedNodes: { node: any, hash: string, identifiers: string[] }[] = [];
  for (const node of unmatchedNodes) {
    const { hash, identifiers } = await computeModuleHash(node.dirPath);
    processedNodes.push({ node, hash, identifiers });
  }

  // Matching Logic
  for (const { node, hash, identifiers } of processedNodes) {
    const relPath = normalize(node.dirPath);
    
    // Priority 1: Exact Path Match
    let matchIdx = oldEntries.findIndex(e => e.path === relPath);
    if (matchIdx !== -1) {
      const old = oldEntries[matchIdx];
      const isConfirmed = old.hash === hash;
      const status: NitsStatus = isConfirmed ? 'active' : 'active'; // Still active if path matches

      const record = createRecord(old.id, node.name, relPath, hash, status, identifiers);
      newModulesRecord[record.id] = record;
      usedIds.add(record.id);
      
      if (isConfirmed) {
        result.confirmed.push(record);
      } else {
        // Technically still active, just updated content
        result.confirmed.push(record);
      }
      
      oldEntries.splice(matchIdx, 1);
      continue;
    }

    // Priority 2: Hash Match (Moved Module)
    matchIdx = oldEntries.findIndex(e => e.hash === hash);
    if (matchIdx !== -1) {
      const old = oldEntries[matchIdx];
      const record = createRecord(old.id, node.name, relPath, hash, 'moved', identifiers);
      
      newModulesRecord[record.id] = record;
      usedIds.add(record.id);
      
      result.moved.push({
        record,
        oldPath: old.path,
        newPath: relPath,
        brokenImports: [] // To be populated if needed
      });
      
      oldEntries.splice(matchIdx, 1);
      continue;
    }

    // Priority 3: Similarity Match (Candidate)
    let bestSimIdx = -1;
    let highestSim = 0;
    for (let j = 0; j < oldEntries.length; j++) {
       const simResult = areIdentitiesSimilar(oldEntries[j].identifiers, node.internalIdentifiers, configThreshold);
       if (simResult.isSimilar && simResult.similarity > highestSim) {
         highestSim = simResult.similarity;
         bestSimIdx = j;
       }
    }

    if (bestSimIdx !== -1) {
      const old = oldEntries[bestSimIdx];
      const record = createRecord(old.id, node.name, relPath, hash, 'candidate', identifiers);
      
      newModulesRecord[record.id] = record;
      usedIds.add(record.id);
      
      result.moved.push({
        record,
        oldPath: old.path,
        newPath: relPath,
        brokenImports: []
      });
      
      oldEntries.splice(bestSimIdx, 1);
      continue;
    }

    // Priority 4: Brand New Module
    const id = generateModuleId(usedIds);
    const record = createRecord(id, node.name, relPath, hash, 'active', identifiers);
    
    newModulesRecord[record.id] = record;
    usedIds.add(record.id);
    result.newModules.push(record);
  }

  // STEP 2: Handle Stale Modules
  for (const old of oldEntries) {
    if (!usedIds.has(old.id)) {
      const staleRecord = { ...old, status: 'stale' as NitsStatus };
      newModulesRecord[staleRecord.id] = staleRecord;
      result.stale.push(staleRecord);
    }
  }

  return {
    registry: {
      project: oldRegistry.project || 'unknown',
      version: NITS_REGISTRY_VERSION,
      lastCheck: timestamp,
      modules: newModulesRecord
    },
    result
  };
}
