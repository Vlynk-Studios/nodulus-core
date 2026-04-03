import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registry } from '../core/registry.js';
import type { ControllerOptions } from '../types/index.js';

function getCallerInfo(): { filePath: string } {
  const originalFunc = Error.prepareStackTrace;
  let callerFile: string | null = null;

  try {
    const err = new Error();
    Error.prepareStackTrace = (_, stack) => stack;
    const stack = err.stack as unknown as NodeJS.CallSite[];
    // Depth: 0 is getCallerInfo, 1 is Controller, 2 is the actual file defining it
    if (stack && stack.length > 2) {
      callerFile = stack[2].getFileName() || null;
    }
  } catch (e) {
    // Fail silently
  } finally {
    Error.prepareStackTrace = originalFunc;
  }

  if (!callerFile) {
    return { filePath: '' };
  }

  if (callerFile.startsWith('file://')) {
    callerFile = fileURLToPath(callerFile);
  }

  return { filePath: callerFile };
}

export function Controller(name: string, options: ControllerOptions = {}): void {
  const { filePath } = getCallerInfo();

  registry.registerControllerMetadata({
    name,
    path: filePath,
    prefix: options.prefix ?? '/',
    middlewares: options.middlewares ?? [],
    enabled: options.enabled ?? true
  });
}
