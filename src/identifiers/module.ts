import path from 'node:path';
import { getActiveRegistry } from '../core/registry.js';
import { NodulusError } from '../core/errors.js';
import { getModuleCallerInfo } from '../core/caller.js';
import type { ModuleOptions } from '../types/index.js';

export function Module(name: string, options: ModuleOptions = {}): void {
  if (typeof name !== 'string') {
    throw new TypeError(`Module name must be a string, received ${typeof name}`);
  }

  const { filePath: indexPath, dirPath } = getModuleCallerInfo('Module()');

  // Rule 1: Name must match folder name
  if (dirPath) {
    const folderName = path.basename(dirPath);
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

  getActiveRegistry().registerModule(name, options, dirPath, indexPath);
}
