import path from 'node:path';
import { NITS_REGISTRY_VERSION } from './constants.js';
import { hashSimilarity } from './nits-hash.js';
import { generateModuleId } from './nits-id.js';
import { NodulusError } from '../core/errors.js';
import type { 
  NitsRegistry, 
  NitsModuleRecord, 
  ReconciliationResult, 
  NitsStatus,
  DiscoveredModule,
  ReconcileOptions
} from '../types/nits.js';

/**
 * Reconciles discovered modules with the persisted NITS registry using the 
 * "Verification Triangle" algorithm.
 * 
 * Step 1 — Match by Path     (maximum confidence)
 * Step 2 — Match by Hash     (high confidence, similarity >= 0.9)
 * Step 3 — Match by Name     (medium confidence, only 'stale' records)
 *
 * NOTE — Why Step 3 only considers 'stale' records (DESIGN-1):
 *
 * A module that fails Steps 1 and 2 in the SAME reconciliation cycle means its
 * path changed AND its identifier similarity dropped below the threshold. At that
 * point, the only evidence left is a shared name — a very weak signal. Allowing
 * Step 3 to match 'active' records here would mean silently merging two different
 * modules just because they have the same Module() name, which is error-prone.
 *
 * The intentional design is a "stale-first" grace cycle:
 *   Run N   → active module fails Step 1 & 2  → goes to `stale` bucket
 *   Run N+1 → now `stale`, Step 3 can rescue it by name as a `candidate`
 *
 * This introduces a one-cycle delay that forces human review (via the `candidate`
 * status) before identity is re-assigned. If this behavior ever needs to change,
 * update the test "Step 3 does NOT rescue an 'active' module that failed Steps 1&2"
 * in nits-reconciler.test.ts as the canonical contract guard.
 */
export async function reconcile(
  discovered: DiscoveredModule[],
  previous: NitsRegistry | null,
  cwd: string = process.cwd(),
  options: ReconcileOptions = {}
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
  
  const normalize = (p: string) => (path.isAbsolute(p) ? path.relative(cwd, p) : p).replace(/\\/g, '/');
  const isCi = options.isCi ?? !!process.env.CI;
  const clonePolicy = options.clonePolicy || (isCi ? 'error' : 'new');
  
  const activeHashes = new Map<string, string>(); // hash -> path

  // STEP 0: Pre-populate active identity carriers from previous registry
  // We ignore empty modules (no identifiers) to avoid N-38 collisions.
  for (const mod of prevModules) {
    if (mod.status === 'active' && mod.identifiers.length > 0) {
      activeHashes.set(mod.hash, mod.path);
    }
  }

  const createRecord = (
    id: string, 
    disc: DiscoveredModule, 
    status: NitsStatus,
    createdAt?: string
  ): NitsModuleRecord => ({
    id,
    name: disc.name,
    path: normalize(disc.dirPath),
    domain: disc.domain,
    hash: disc.hash,
    status,
    createdAt: createdAt || timestamp,
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
      const record = createRecord(prev.id, disc, 'active', prev.createdAt);
      result.confirmed.push(record);
      
      if (disc.identifiers.length > 0) {
        activeHashes.set(disc.hash, record.path);
      }
      
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
      
      const threshold = options.similarityThreshold ?? 0.9;
      if (sim >= threshold) {
        matchesForThisDisc.push({ sim, idx: j });
      }
    }

    // DISAMBIGUATION: If multiple records have high similarity, we don't assume (Step 2 Requirement)
    if (matchesForThisDisc.length === 1) {
      const bestMatchIdx = matchesForThisDisc[0].idx;
      const prev = unmatchedPrev[bestMatchIdx];
      const record = createRecord(prev.id, disc, 'moved', prev.createdAt);
      
      result.moved.push({
        record,
        oldPath: prev.path,
        newPath: normalize(disc.dirPath),
        brokenImports: []
      });

      if (disc.identifiers.length > 0) {
        activeHashes.set(disc.hash, record.path);
      }

      unmatchedDiscovered.splice(i, 1);
      unmatchedPrev.splice(bestMatchIdx, 1);
    }
  }

  // STEP 3: Match by Name (Medium Confidence)
  for (let i = unmatchedDiscovered.length - 1; i >= 0; i--) {
    const disc = unmatchedDiscovered[i];
    
    // DESIGN-1: We deliberately restrict Step 3 to 'stale' records only.
    // Matching an 'active' record by name alone (after failing path + hash) is
    // too weak a signal — it could silently merge unrelated modules that share a
    // Module() name. See the JSDoc above for the full "stale-first" rationale.
    const matches = unmatchedPrev.filter(p => p.name === disc.name && p.status === 'stale');
    
    if (matches.length === 1) {
      const prev = matches[0];
      const prevIdx = unmatchedPrev.indexOf(prev);
      const record = createRecord(prev.id, disc, 'candidate', prev.createdAt);
      
      result.candidates.push({
        record,
        oldPath: prev.path,
        newPath: normalize(disc.dirPath),
        brokenImports: []
      });

      if (disc.identifiers.length > 0) {
        activeHashes.set(disc.hash, record.path);
      }

      unmatchedDiscovered.splice(i, 1);
      unmatchedPrev.splice(prevIdx, 1);
    }
  }

  // FINALIZATION: New Modules & Stale
  for (const disc of unmatchedDiscovered) {
    // CLONE DETECTION
    if (activeHashes.has(disc.hash)) {
      const originalPath = activeHashes.get(disc.hash)!;
      if (clonePolicy === 'error') {
        throw new NodulusError(
          'DUPLICATE_MODULE',
          `Duplicate module content detected: "${disc.name}" has the same content as already registered module at "${originalPath}".`,
          `If this is intentional (e.g. a template or shared code), ensure they have distinct identifiers or use NITS clonePolicy='new' in dev.`
        );
      }
    }

    const id = generateModuleId(usedIds);
    const record = createRecord(id, disc, 'active');
    usedIds.add(id);
    result.newModules.push(record);

    if (disc.identifiers.length > 0) {
      activeHashes.set(disc.hash, record.path);
    }
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
    // DESIGN-2 fix: persist candidates with status 'candidate', NOT 'stale'.
    // Rationale: 'stale' implies the module is lost; 'candidate' means "needs human
    // review — probably a move, identity preserved tentatively". Using the correct
    // status makes the registry semantically honest and allows tooling to surface
    // candidates distinctly from truly lost modules.
    //
    // Stabilization path (still works — Step 1 has no status filter):
    //   Cycle N   → saved as { status: 'candidate', path: new-path, id: old-id }
    //   Cycle N+1 → Step 1 matches by new-path → confirmed as 'active'
    ...result.candidates.map(m => m.record),  // already has status: 'candidate'
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
