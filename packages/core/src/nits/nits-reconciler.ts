import path from 'node:path';
import { areIdentitiesSimilar } from './nits-hash.js';
import { generateNitsId } from './nits-id.js';
import type { ModuleGraph } from '../cli/lib/graph-builder.js';
import type { NitsRegistry, NitsModuleEntry } from './nits-store.js';

export interface ReconciliationSummary {
  newModules: number;
  movedModules: number;
  healedConflicts: number;
}

/**
 * Reconciles the current module graph with the persisted NITS registry.
 * 
 * Strategy:
 * 1. Match by exact path (standard case).
 * 2. Match orphans by identity similarity (moved/renamed folders).
 * 3. Assign new IDs to remaining nodes.
 * 4. Resolve ID conflicts (healing) if they arise from merge conflicts.
 */
export function reconcile(
  graph: ModuleGraph, 
  oldRegistry: NitsRegistry, 
  cwd: string,
  configThreshold?: number
): { registry: NitsRegistry; summary: ReconciliationSummary } {
  const newModulesRecord: Record<string, NitsModuleEntry> = {};
  const orphanedEntries = Object.entries(oldRegistry.modules);
  const summary: ReconciliationSummary = { 
    newModules: 0, 
    movedModules: 0, 
    healedConflicts: 0 
  };
  
  const usedIds = new Set<string>();
  const normalize = (p: string) => path.relative(cwd, p).replace(/\\/g, '/');

  // STEP 1: Match modules by exact path (Priority 1)
  const unmatchedNodes = [...graph.modules];
  for (let i = unmatchedNodes.length - 1; i >= 0; i--) {
    const node = unmatchedNodes[i];
    const relPath = normalize(node.dirPath);
    
    // Find entry with same path
    const matchIdx = orphanedEntries.findIndex(([_, entry]) => entry.path === relPath);
    if (matchIdx !== -1) {
      const [_, entry] = orphanedEntries[matchIdx];
      
      // Healing: If ID is already taken by another previously matched module
      if (usedIds.has(entry.id)) {
        entry.id = generateNitsId();
        summary.healedConflicts++;
      }

      usedIds.add(entry.id);
      newModulesRecord[node.name] = {
        id: entry.id,
        path: relPath,
        identifiers: node.internalIdentifiers
      };

      unmatchedNodes.splice(i, 1);
      orphanedEntries.splice(matchIdx, 1);
    }
  }

  // STEP 2: Match remaining nodes by Identity Similarity (Priority 2)
  for (let i = unmatchedNodes.length - 1; i >= 0; i--) {
    const node = unmatchedNodes[i];
    
    let bestMatchIdx = -1;
    let highestSim = 0;

    for (let j = 0; j < orphanedEntries.length; j++) {
      const [_, entry] = orphanedEntries[j];
      const simResult = areIdentitiesSimilar(entry.identifiers, node.internalIdentifiers, configThreshold);
      
      if (simResult.isSimilar && simResult.similarity > highestSim) {
        highestSim = simResult.similarity;
        bestMatchIdx = j;
      }
    }

    if (bestMatchIdx !== -1) {
      const [_, entry] = orphanedEntries[bestMatchIdx];
      
      // Healing: If similarity match has a duplicate ID
      if (usedIds.has(entry.id)) {
        entry.id = generateNitsId();
        summary.healedConflicts++;
      }

      usedIds.add(entry.id);
      newModulesRecord[node.name] = {
        id: entry.id,
        path: normalize(node.dirPath),
        identifiers: node.internalIdentifiers
      };

      summary.movedModules++;
      unmatchedNodes.splice(i, 1);
      orphanedEntries.splice(bestMatchIdx, 1);
    }
  }

  // STEP 3: Assign and create new IDs for brand new modules
  for (const node of unmatchedNodes) {
    const id = generateNitsId();
    usedIds.add(id);
    newModulesRecord[node.name] = {
      id,
      path: normalize(node.dirPath),
      identifiers: node.internalIdentifiers
    };
    summary.newModules++;
  }

  return {
    registry: {
      version: oldRegistry.version || '1.0.0',
      modules: newModulesRecord
    },
    summary
  };
}
