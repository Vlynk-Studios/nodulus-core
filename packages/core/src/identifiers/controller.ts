import path from 'node:path';
import { getActiveRegistry } from '../core/registry.js';
import { getFileCallerInfo } from '../core/caller.js';
import { normalizePath } from '../core/utils/paths.js';
import type { ControllerOptions } from '../types/index.js';

export function Controller(prefix: string, options: ControllerOptions = {}): void {
  if (typeof prefix !== 'string') {
    throw new TypeError(`Controller prefix must be a string, received ${typeof prefix}`);
  }

  const { filePath } = getFileCallerInfo('Controller()');
  const name = path.parse(filePath).name;

  getActiveRegistry().registerControllerMetadata({
    name,
    path: normalizePath(filePath),
    prefix: prefix,
    middlewares: options.middlewares ?? [],
    enabled: options.enabled ?? true
  });
}
