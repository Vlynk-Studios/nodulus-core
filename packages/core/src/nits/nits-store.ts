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

/**
 * Loads the NITS registry.
 * Returns a fresh registry if the file is missing or corrupted.
 */
export function loadNitsRegistry(cwd: string, registryPath: string): NitsRegistry {
  const fullPath = path.isAbsolute(registryPath) ? registryPath : path.join(cwd, registryPath);
  
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
  } catch (err: any) {
    console.warn(`[Nodulus] Warning: NITS registry at "${fullPath}" is corrupted or invalid. Returning a blank state. Detail: ${err.message}`);
    // In case of corruption, we return a blank state that will be "healed" later
    return { version: '1.0.0', modules: {} };
  }
}

/**
 * Saves the NITS registry.
 */
export function saveNitsRegistry(cwd: string, registry: NitsRegistry, registryPath: string): void {
  const fullPath = path.isAbsolute(registryPath) ? registryPath : path.join(cwd, registryPath);
  const dir = path.dirname(fullPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullPath, JSON.stringify(registry, null, 2), 'utf-8');
}
