export type NitsStatus = 'active' | 'stale' | 'moved' | 'candidate';

export interface DiscoveredModule {
  name: string;
  dirPath: string;
  domain?: string;         // Reserved for v2.0.0 (Domain-driven architecture). Always undefined in v1.x.
  identifiers: string[];   // names extracted by nits-hash
  hash: string;
}

export interface NitsModuleRecord {
  id: string;          // "mod_8f2a9b1c" — unique persistent identifier
  name: string;        // current module name
  path: string;        // directory path (relative to cwd in registry file)
  domain?: string;     // undefined in v1.x projects without Domain() support
  hash: string;        // content-based signature (see nits-hash.ts)
  status: NitsStatus;
  createdAt: string;   // ISO 8601 timestamp (immutable)
  lastSeen: string;    // ISO 8601 timestamp
  identifiers: string[];
}

export interface ReconcileOptions {
  clonePolicy?: 'error' | 'new';
  isCi?: boolean;
  similarityThreshold?: number;
}

export interface NitsRegistry {
  _note?: string;       // Metadata for the human developer
  project: string;
  version: string;      // NITS schema version
  lastCheck: string;    // ISO 8601 timestamp
  modules: Record<string, NitsModuleRecord>; // key: id
}

export interface BrokenImport {
  file: string;
  line: number;
  specifier: string;   // alias pointing to a legacy path
}

export interface MovedModule {
  record: NitsModuleRecord;
  oldPath: string;
  newPath: string;
  brokenImports: BrokenImport[];
}

export interface ReconciliationResult {
  confirmed: NitsModuleRecord[];   // path + hash match
  moved: MovedModule[];            // high confidence move (hash match)
  candidates: MovedModule[];       // medium confidence move (name match)
  stale: NitsModuleRecord[];       // disappeared from disk
  newModules: NitsModuleRecord[];  // no match in previous registry
}
