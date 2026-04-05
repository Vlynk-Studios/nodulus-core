import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getActiveRegistry } from '../core/registry.js';
import { NodulusError } from '../core/errors.js';
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
  } catch {
    // getFileName() is unavailable in this environment;
    // the null-check below will throw a descriptive NodulusError.
  } finally {
    Error.prepareStackTrace = originalFunc;
  }

  if (!callerFile) {
    throw new NodulusError(
      'INVALID_CONTROLLER',
      'Controller() could not determine caller path. Stack trace unavailable.',
      'Ensure you are using Node.js >= 20.6 with ESM and no bundler obfuscation.'
    );
  }

  if (callerFile.startsWith('file://')) {
    callerFile = fileURLToPath(callerFile);
  }

  return { filePath: callerFile };
}

export function Controller(prefix: string, options: ControllerOptions = {}): void {
  if (typeof prefix !== 'string') {
    throw new TypeError(`Controller prefix must be a string, received ${typeof prefix}`);
  }

  const { filePath } = getCallerInfo();
  const name = path.parse(filePath).name;

  getActiveRegistry().registerControllerMetadata({
    name,
    path: filePath,
    prefix: prefix,
    middlewares: options.middlewares ?? [],
    enabled: options.enabled ?? true
  });
}
