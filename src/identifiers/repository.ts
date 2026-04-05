import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getActiveRegistry } from '../core/registry.js';
import { NodulusError } from '../core/errors.js';
import type { RepositoryOptions } from '../types/index.js';

function getCallerInfo(): { filePath: string } {
  const originalFunc = Error.prepareStackTrace;
  let callerFile: string | null = null;

  try {
    const err = new Error();
    Error.prepareStackTrace = (_, stack) => stack;
    const stack = err.stack as unknown as NodeJS.CallSite[];
    // Depth: 0 is getCallerInfo, 1 is Repository, 2 is the actual file defining it
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
      'REGISTRY_MISSING_CONTEXT',
      'Repository() could not determine caller path. Stack trace unavailable.',
      'Ensure you are using Node.js >= 20.6 with ESM and no bundler obfuscation.'
    );
  }

  if (callerFile.startsWith('file://')) {
    callerFile = fileURLToPath(callerFile);
  }

  return { filePath: callerFile };
}

/**
 * Declares a file as a named repository and registers it in the Nodulus registry.
 *
 * The `module` field is inferred from the parent folder name when not provided explicitly.
 *
 * @param name    - Unique repository name within the registry (e.g. 'UserRepository').
 * @param options - Optional configuration: module override, description, and data source type.
 *
 * @example
 * // src/modules/users/users.repository.ts
 * import { Repository } from 'nodulus'
 *
 * Repository('UserRepository', { module: 'users', source: 'database' })
 *
 * export const UserRepository = { ... }
 */
export function Repository(name: string, options: RepositoryOptions = {}): void {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError(`Repository name must be a non-empty string, received ${typeof name}`);
  }

  const { filePath } = getCallerInfo();

  // Infer module from the parent folder name if not explicitly provided
  const inferredModule = options.module ?? path.basename(path.dirname(filePath));

  getActiveRegistry().registerFileMetadata({
    name,
    path: filePath,
    type: 'repository',
    module: inferredModule,
    description: options.description,
    source: options.source,
  });
}
