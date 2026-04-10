import fs from 'node:fs';
import path from 'node:path';

export interface NitsModuleEntry {
  id: string;
  path: string; // Relative path to project root
  identifiers: string[];
}

export interface NitsRegistry {
  version: string;
  modules: Record<string, NitsModuleEntry>; // Key is module name (logical name)
}

const REGISTRY_PATH = '.nodulus/registry.json';

/**
 * Loads the NITS registry from .nodulus/registry.json.
 * Returns a fresh registry if the file is missing or corrupted.
 */
export function loadNitsRegistry(cwd: string): NitsRegistry {
  const fullPath = path.join(cwd, REGISTRY_PATH);
  
  if (!fs.existsSync(fullPath)) {
    return { version: '1.0.0', modules: {} };
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const data = JSON.parse(content);
    
    // Minimal validation
    if (!data.modules || typeof data.modules !== 'object') {
      throw new Error('Invalid registry format');
    }
    
    return data as NitsRegistry;
  } catch (_err) {
    // In case of corruption, we return a blank state that will be "healed" later
    return { version: '1.0.0', modules: {} };
  }
}

/**
 * Saves the NITS registry to .nodulus/registry.json.
 */
export function saveNitsRegistry(cwd: string, registry: NitsRegistry): void {
  const fullPath = path.join(cwd, REGISTRY_PATH);
  const dir = path.dirname(fullPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullPath, JSON.stringify(registry, null, 2), 'utf-8');
}
