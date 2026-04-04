import path from 'node:path';
import { getAliasCache } from './cache.js';
import type { GetAliasesOptions } from '../types/index.js';

export function getAliases(options: GetAliasesOptions = {}): Record<string, string> {
  const includeFolders = options.includeFolders ?? true;
  const absolute = options.absolute ?? false;

  const allAliases = getAliasCache();
  const result: Record<string, string> = {};
  const cwd = process.cwd();
  
  for (const [alias, target] of Object.entries(allAliases)) {
    if (!includeFolders && !alias.startsWith('@modules/')) {
      continue;
    }
    
    let resolvedPath: string;
    
    if (absolute) {
      resolvedPath = path.isAbsolute(target) ? target : path.resolve(cwd, target);
      // Extra step if it's a @modules to point to index specifically (optional, but often useful for bundlers resolving dynamic exports)
      // Actually, we maintain exactly what is stored!
    } else {
      resolvedPath = path.isAbsolute(target) ? path.relative(cwd, target) : target;
      
      // Ensure positive POSIX formatting for bundlers
      resolvedPath = resolvedPath.replace(/\\/g, '/');
      if (!resolvedPath.startsWith('.') && !resolvedPath.startsWith('/')) {
        resolvedPath = './' + resolvedPath;
      }
    }
    
    result[alias] = resolvedPath;
  }
  
  return result;
}
