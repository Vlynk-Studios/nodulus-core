import fs from 'node:fs';
import path from 'node:path';
import { NITS_REGISTRY_VERSION } from './constants.js';
import { isValidModuleId } from './nits-id.js';

import type { NitsRegistry } from '../types/nits.js';

/**
 * Loads the NITS registry.
 * Returns a fresh registry if the file is missing or corrupted.
 */
export function loadNitsRegistry(cwd: string, registryPath: string): NitsRegistry {
  const fullPath = path.isAbsolute(registryPath) ? registryPath : path.join(cwd, registryPath);
  
  const createEmptyRegistry = (): NitsRegistry => ({ 
    project: resolveProjectName(cwd),
    version: NITS_REGISTRY_VERSION, 
    lastCheck: new Date().toISOString(),
    modules: {} 
  });

  if (!fs.existsSync(fullPath)) {
    return createEmptyRegistry();
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const data = JSON.parse(content);
    
    // Minimal validation
    if (!data.modules || typeof data.modules !== 'object') {
      throw new Error('Invalid registry format');
    }

    if (data.version && data.version !== NITS_REGISTRY_VERSION) {
      console.warn(`[Nodulus] Warning: NITS registry version mismatch (found ${data.version}, expected ${NITS_REGISTRY_VERSION}).`);
    }

    for (const [id, mod] of Object.entries(data.modules)) {
      if (!isValidModuleId(id)) {
        throw new Error(`Corrupt NITS ID found in registry key: ${id}`);
      }
    }
    
    return data as NitsRegistry;
  } catch (err: any) {
    console.warn(`[Nodulus] Warning: NITS registry at "${fullPath}" is corrupted or invalid. Returning a blank state. Detail: ${err.message}`);
    return createEmptyRegistry();
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

  // Ensure project name is current
  registry.project = resolveProjectName(cwd);
  registry.lastCheck = new Date().toISOString();

  fs.writeFileSync(fullPath, JSON.stringify(registry, null, 2), 'utf-8');
}

/**
 * Resolves the project name from package.json in the current working directory.
 */
function resolveProjectName(cwd: string): string {
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return pkg.name || 'unnamed-project';
    }
  } catch {
    // Failsafe
  }
  return 'unnamed-project';
}
