import path from 'node:path';
import { getActiveRegistry } from '../core/registry.js';
import { getFileCallerInfo } from '../core/caller.js';
import type { RepositoryOptions } from '../types/index.js';

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

  const { filePath } = getFileCallerInfo('Repository()');

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
