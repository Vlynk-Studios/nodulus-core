import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodulusError } from '../core/errors.js';

/**
 * Internal utility — NOT part of the public Nodulus API.
 *
 * Walks the V8 call stack to find the file that called one of the Nodulus
 * identifier functions (Module, Service, Controller, Repository, Schema).
 *
 * Stack layout when an identifier function calls this helper:
 *   0 — resolveCallerFile      (this function)
 *   1 — Module / Service / … (the identifier)
 *   2 — the user's source file (the caller we want)
 *
 */
function resolveCallerFile(identifierName: string): string {
  const originalFunc = Error.prepareStackTrace;
  let callerFile: string | null = null;

  try {
    const err = new Error();
    Error.prepareStackTrace = (_, stack) => stack;
    const stack = err.stack as unknown as NodeJS.CallSite[];
    // Depth: 0 is resolveCallerFile, 1 is getCallerFileAndDir/getCallerFilePath, 2 is the identifier (Module, Service), 3 is the user's file
    if (stack && stack.length > 3) {
      callerFile = stack[3].getFileName() || null;
    }
  } catch {
    // getFileName() is unavailable in this environment;
    // the null-check below will throw a descriptive NodulusError.
  } finally {
    Error.prepareStackTrace = originalFunc;
  }

  if (!callerFile) {
    throw new NodulusError(
      'INVALID_MODULE_DECLARATION',
      `${identifierName} could not determine caller path. Stack trace unavailable.`,
      'Ensure you are using Node.js >= 20.6 with ESM and no bundler obfuscation.'
    );
  }

  // Normalise ESM file:// URLs to OS-native paths
  if (callerFile.startsWith('file://')) {
    callerFile = fileURLToPath(callerFile);
  }

  return callerFile;
}

/**
 * Returns the caller's file path and its containing directory.
 * Used by `Module()`, which needs both pieces to enforce naming rules.
 */
export function getModuleCallerInfo(
  identifierName: string
): { filePath: string; dirPath: string } {
  const filePath = resolveCallerFile(identifierName);
  return { filePath, dirPath: path.dirname(filePath) };
}

/**
 * Returns only the caller's absolute file path.
 * Used by all non-Module identifiers (Service, Controller, Repository, Schema).
 */
export function getFileCallerInfo(
  identifierName: string
): { filePath: string } {
  return { filePath: resolveCallerFile(identifierName) };
}
