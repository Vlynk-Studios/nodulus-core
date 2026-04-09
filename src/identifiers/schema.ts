import path from 'node:path';
import { getActiveRegistry } from '../core/registry.js';
import { getFileCallerInfo } from '../core/caller.js';
import type { SchemaOptions } from '../types/index.js';

/**
 * Declares a file as a named validation schema and registers it in the Nodulus registry.
 *
 * The `module` field is inferred from the parent folder name when not provided explicitly.
 *
 * @param name    - Unique schema name within the registry (e.g. 'CreateUserSchema').
 * @param options - Optional configuration: module override, description, and validation library.
 *
 * @example
 * // src/modules/users/users.schema.ts
 * import { Schema } from 'nodulus'
 *
 * Schema('CreateUserSchema', { module: 'users', library: 'zod' })
 *
 * export const CreateUserSchema = z.object({ ... })
 */
export function Schema(name: string, options: SchemaOptions = {}): void {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new TypeError(`Schema name must be a non-empty string, received ${typeof name}`);
  }

  const { filePath } = getFileCallerInfo('Schema()');

  // Infer module from the parent folder name if not explicitly provided
  const inferredModule = options.module ?? path.basename(path.dirname(filePath));

  getActiveRegistry().registerFileMetadata({
    name,
    path: filePath,
    type: 'schema',
    module: inferredModule,
    description: options.description,
    library: options.library,
  });
}
