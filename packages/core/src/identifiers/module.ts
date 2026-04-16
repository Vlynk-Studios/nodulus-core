import path from 'node:path';
import { getActiveRegistry } from '../core/registry.js';
import { NodulusError } from '../core/errors.js';
import { getModuleCallerInfo } from '../core/caller.js';
import { generateModuleId } from '../nits/nits-id.js';
import { normalizePath } from '../core/utils/paths.js';
import type { ModuleOptions } from '../types/index.js';

/**
 * Declares a Nodulus module and registers its options in the application registry.
 * Must be called from the module's index file.
 * 
 * @param name    - Unique name of the module. Must match the folder name.
 * @param options - Module configuration (imports, exports, etc.).
 */
export function Module(name: string, options: ModuleOptions = {}): void {
  if (typeof name !== 'string') {
    throw new TypeError(`Module name must be a string, received ${typeof name}`);
  }

  const { filePath: indexPath, dirPath } = getModuleCallerInfo('Module()');
  const normalizedIndexPath = normalizePath(indexPath);
  const normalizedDirPath = normalizePath(dirPath);

  // Rule 1: Name must match folder name
  if (normalizedDirPath) {
    const folderName = path.basename(normalizedDirPath);
    if (folderName && folderName !== name) {
      throw new NodulusError(
        'INVALID_MODULE_DECLARATION',
        `Module name "${name}" does not match its containing folder "${folderName}".`,
        `The module name in Module() MUST match the folder name exactly.`
      );
    }
  }

  // Rule 2: Must be called from index file
  const fileName = path.basename(indexPath);
  const isIndexFile = /index\.(ts|js|mts|mjs)$/.test(fileName);
  if (!isIndexFile) {
    throw new NodulusError(
      'INVALID_MODULE_DECLARATION',
      `Module() was called from "${fileName}", but it must be called only from the module's index file.`,
      `File: ${indexPath}`
    );
  }

  const registry = getActiveRegistry();
  
  // Rule 3: NITS Identity Retrieval
  // The ID is pre-calculated during bootstrap reconciliation before the module is imported.
  // If not found (e.g., NITS disabled or manual import), we generate a stable temporary ID.
  const nitsId = registry.getNitsIdForPath(normalizePath(dirPath)) || generateModuleId();

  registry.registerModule(name, options, dirPath, indexPath, nitsId);
}
