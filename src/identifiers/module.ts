import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registry } from '../core/registry.js';
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
  } catch (e) {
    // Fail silently, use defaults if error tracing isn't available
  } finally {
    Error.prepareStackTrace = originalFunc;
  }

  if (!callerFile) {
    return { dirPath: '', indexPath: '' };
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

  if (dirPath) {
    const folderName = path.basename(dirPath);
    if (folderName && folderName !== name) {
      console.warn(`[Nodulus] Warning: Module name "${name}" does not match its containing folder "${folderName}".`);
    }
  }

  registry.registerModule(name, options, dirPath, indexPath);
}
