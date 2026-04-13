import fs from 'node:fs';
import path from 'node:path';
import { NITS_REGISTRY_VERSION } from './constants.js';
import { isValidNitsId } from './nits-id.js';

import type { NitsRegistry, NitsModuleEntry } from '../types/nits.js';

/**
 * Loads the NITS registry.
 * Returns a fresh registry if the file is missing or corrupted.
 */
export function loadNitsRegistry(cwd: string, registryPath: string): NitsRegistry {
  const fullPath = path.isAbsolute(registryPath) ? registryPath : path.join(cwd, registryPath);
  
  if (!fs.existsSync(fullPath)) {
    return { version: NITS_REGISTRY_VERSION, modules: {} };
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const data = JSON.parse(content);
    
    // Minimal validation
    if (!data.modules || typeof data.modules !== 'object') {
      throw new Error('Invalid registry format');
    }

    if (data.version && data.version !== NITS_REGISTRY_VERSION) {
      console.warn(`[Nodulus] Warning: NITS registry version mismatch (found ${data.version}, expected ${NITS_REGISTRY_VERSION}). An automatic migration or healing will be attempted.`);
    }

    for (const [name, mod] of Object.entries(data.modules)) {
      const typedMod = mod as NitsModuleEntry;
      if (!isValidNitsId(typedMod.id)) {
        throw new Error(`Corrupt NITS ID found for module "${name}": ${typedMod.id}`);
      }
    }
    
    return data as NitsRegistry;
  } catch (err: any) {
    console.warn(`[Nodulus] Warning: NITS registry at "${fullPath}" is corrupted or invalid. Returning a blank state. Detail: ${err.message}`);
    // In case of corruption, we return a blank state that will be "healed" later
    return { version: NITS_REGISTRY_VERSION, modules: {} };
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
