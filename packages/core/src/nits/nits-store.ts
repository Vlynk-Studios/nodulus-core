import fs from 'node:fs';
import path from 'node:path';
import { NITS_REGISTRY_VERSION } from './constants.js';
import { isValidModuleId } from './nits-id.js';

import type { NitsRegistry } from '../types/nits.js';

/**
 * Returns the project name inferred from package.json in the current working directory.
 */
export function inferProjectName(cwd: string): string {
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return pkg.name || 'unknown';
    }
  } catch {
    // Failsafe
  }
  return 'unknown';
}

/**
 * Initializes an empty NITS registry state.
 */
export function initNitsRegistry(projectName: string): NitsRegistry {
  return {
    project: projectName || 'unknown',
    version: NITS_REGISTRY_VERSION,
    lastCheck: new Date().toISOString(),
    modules: {}
  };
}

/**
 * Loads the NITS registry from the standardized path (.nodulus/registry.json).
 * Returns null if the file is missing or corrupted.
 */
export async function loadNitsRegistry(cwd: string): Promise<NitsRegistry | null> {
  const fullPath = path.join(cwd, '.nodulus', 'registry.json');
  
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  try {
    const content = await fs.promises.readFile(fullPath, 'utf-8');
    const data = JSON.parse(content);
    
    // Schema Validation
    if (!isValidRegistry(data)) {
      console.warn(`[Nodulus] Warning: NITS registry at "${fullPath}" has an invalid structure. Ignoring.`);
      return null;
    }

    if (data.version !== NITS_REGISTRY_VERSION) {
      console.warn(`[Nodulus] Warning: NITS registry version mismatch (found ${data.version}, expected ${NITS_REGISTRY_VERSION}).`);
    }

    // Deep validation of module IDs
    for (const id of Object.keys(data.modules)) {
      if (!isValidModuleId(id)) {
        console.warn(`[Nodulus] Warning: Corrupt NITS ID found in registry: ${id}. Registry considered invalid.`);
        return null;
      }
    }
    
    return data as NitsRegistry;
  } catch (err: any) {
    console.warn(`[Nodulus] Warning: Failed to load NITS registry at "${fullPath}": ${err.message}`);
    return null;
  }
}

/**
 * Validates the basic structure of a NITS registry object.
 */
function isValidRegistry(data: any): data is NitsRegistry {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.project === 'string' &&
    typeof data.version === 'string' &&
    typeof data.lastCheck === 'string' &&
    data.modules &&
    typeof data.modules === 'object'
  );
}


/**
 * Saves the NITS registry to the standardized path (.nodulus/registry.json).
 */
export async function saveNitsRegistry(registry: NitsRegistry, cwd: string): Promise<void> {
  const fullPath = path.join(cwd, '.nodulus', 'registry.json');
  const dir = path.dirname(fullPath);
  
  if (!fs.existsSync(dir)) {
    await fs.promises.mkdir(dir, { recursive: true });
  }

  // Ensure metadata is current before persisting
  registry.project = inferProjectName(cwd);
  registry.lastCheck = new Date().toISOString();

  await fs.promises.writeFile(
    fullPath, 
    JSON.stringify(registry, null, 2), 
    'utf-8'
  );
}

