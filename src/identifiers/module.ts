import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getActiveRegistry } from '../core/registry.js';
import { NodulusError } from '../core/errors.js';
import type { ModuleOptions } from '../types/index.js';

function getCallerInfo(): { dirPath: string; indexPath: string } {
  const originalFunc = Error.prepareStackTrace;
  let callerFile: string | null = null;

  try {
    const err = new Error();
    Error.prepareStackTrace = (_, stack) => stack;
    const stack = err.stack as unknown as NodeJS.CallSite[];
    // Stack trace depth: 0 is getCallerInfo, 1 is Module, 2 is the actual file defining the module
    if (stack && stack.length > 2) {
      callerFile = stack[2].getFileName() || null;
    }
  } catch {
    // getFileName() is unavailable in this environment;
    // the null-check below will throw a descriptive NodulusError.
  } finally {
    Error.prepareStackTrace = originalFunc;
  }

  if (!callerFile) {
    throw new NodulusError(
      'MODULE_NOT_FOUND',
      'Module() could not determine caller path. Stack trace unavailable.',
      'Ensure you are using Node.js >= 20.6 with ESM and no bundler obfuscation.'
    );
  }

  // Handle ESM URLs
  if (callerFile.startsWith('file://')) {
    callerFile = fileURLToPath(callerFile);
  }

  return {
    dirPath: path.dirname(callerFile),
    indexPath: callerFile
  };
}

export function Module(name: string, options: ModuleOptions = {}): void {
  if (typeof name !== 'string') {
    throw new TypeError(`Module name must be a string, received ${typeof name}`);
  }

  const { dirPath, indexPath } = getCallerInfo();

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
  const isIndexFile = /index\.(ts|js|mts|mjs|cjs|cts)$/.test(fileName);
  if (!isIndexFile) {
    throw new NodulusError(
      'INVALID_MODULE_DECLARATION',
      `Module() was called from "${fileName}", but it must be called only from the module's index file.`,
      `File: ${indexPath}`
    );
  }

  getActiveRegistry().registerModule(name, options, dirPath, indexPath);
}
