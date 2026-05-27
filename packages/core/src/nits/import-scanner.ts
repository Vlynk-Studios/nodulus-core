import path from 'node:path';
import fg from 'fast-glob';
import type { MovedModule } from '../types/nits.js';
import { calculateAlias } from './utils.js';
import {
  extractModuleImports,
} from '../cli/lib/import-scanner.js';

export type { ImportFound } from '../cli/lib/import-scanner.js';
export {
  extractModuleImports,
  extractRelativeCrossModuleImports,
  buildActiveAliasesFromConfig,
  getRegisteredAliases,
} from '../cli/lib/import-scanner.js';

/**
 * Given a list of moved modules, scans the entire project for files that
 * are still importing from the old aliases.
 */
export async function scanBrokenImports(
  movedModules: MovedModule[],
  projectRoot: string,
): Promise<MovedModule[]> {
  if (movedModules.length === 0) return [];

  const files = await fg('**/*.{ts,js,mts,mjs}', {
    cwd: projectRoot,
    absolute: true,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.test.*',
      '**/*.spec.*',
      '**/*.d.ts',
    ],
  });

  const movedWithAliases = movedModules.map(m => ({
    ...m,
    oldAlias: calculateAlias(m.oldPath),
  }));

  const activeAliases = new Set<string>(['@modules']);
  for (const moved of movedWithAliases) {
    activeAliases.add(moved.oldAlias);
    const scope = moved.oldAlias.split('/')[0];
    if (scope.startsWith('@')) {
      activeAliases.add(scope);
    }
  }

  for (const file of files) {
    const imports = extractModuleImports(file, [...activeAliases]);
    if (imports.length === 0) continue;

    for (const imp of imports) {
      for (const moved of movedWithAliases) {
        const alias = moved.oldAlias;
        if (imp.specifier === alias || imp.specifier.startsWith(`${alias}/`)) {
          moved.brokenImports.push({
            file: path.relative(projectRoot, file).replace(/\\/g, '/'),
            line: imp.line,
            specifier: imp.specifier,
          });
        }
      }
    }
  }

  return movedWithAliases.map(({ oldAlias: _oldAlias, ...m }) => m as MovedModule);
}
