import path from 'node:path';
import { getActiveRegistry } from '../core/registry.js';
import { getFileCallerInfo } from '../core/caller.js';
import type { ServiceOptions } from '../types/index.js';

/**
 * Declares a file as a named service and registers it in the Nodulus registry.
 *
 * The `module` field is inferred from the parent folder name when not provided explicitly.
 *
 * @param name    - Unique service name within the registry (e.g. 'UserService').
 * @param options - Optional configuration: module override and description.
 *
 * @example
 * // src/modules/users/users.service.ts
 * import { Service } from 'nodulus'
 *
 * Service('UserService', { module: 'users' })
 *
 * export const UserService = { ... }
 */
export function Service(name: string, options: ServiceOptions = {}): void {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError(`Service name must be a non-empty string, received ${typeof name}`);
  }

  const { filePath } = getFileCallerInfo('Service()');

  // Infer module from the parent folder name if not explicitly provided
  const inferredModule = options.module ?? path.basename(path.dirname(filePath));

  getActiveRegistry().registerFileMetadata({
    name,
    path: filePath,
    type: 'service',
    module: inferredModule,
    description: options.description,
  });
}
