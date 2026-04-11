import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { NodulusConfig } from '../../types/index.js';

export async function generatePathAliases(config: NodulusConfig, cwd: string): Promise<Record<string, string[]>> {
  const pathsObj: Record<string, string[]> = {};

  // 1. Register base modules generated paths
  if (config.modules) {
    const globPattern = config.modules.replace(/\\/g, '/');
    const moduleDirs = await fg(globPattern, {
      onlyDirectories: true,
      absolute: true,
      cwd
    });

    moduleDirs.sort();

    for (const dirPath of moduleDirs) {
      const modName = path.basename(dirPath);
      const aliasKey = `@modules/${modName}`;
      
      let indexPath = path.join(dirPath, 'index.ts');
      if (!fs.existsSync(indexPath)) {
        indexPath = path.join(dirPath, 'index.js');
      }

      let relativeIndexPath = path.relative(cwd, indexPath).replace(/\\/g, '/');
      if (!relativeIndexPath.startsWith('./') && !relativeIndexPath.startsWith('../')) {
        relativeIndexPath = './' + relativeIndexPath;
      }

      let relativeDirPath = path.relative(cwd, dirPath).replace(/\\/g, '/');
      if (!relativeDirPath.startsWith('./') && !relativeDirPath.startsWith('../')) {
        relativeDirPath = './' + relativeDirPath;
      }
      
      // Dual mapping: base points to index, wildcard points to directory
      pathsObj[aliasKey] = [relativeIndexPath];
      pathsObj[`${aliasKey}/*`] = [`${relativeDirPath}/*`];
    }
  }

  // 2. Register domains generated paths
  if (config.domains) {
    const globPattern = config.domains.replace(/\\/g, '/');
    const domainDirs = await fg(globPattern, {
      onlyDirectories: true,
      absolute: true,
      cwd
    });
    
    domainDirs.sort();
    
    for (const dirPath of domainDirs) {
      const domainName = path.basename(dirPath);
      
      let indexPath = path.join(dirPath, 'index.ts');
      if (!fs.existsSync(indexPath)) {
        indexPath = path.join(dirPath, 'index.js');
      }
      
      let relativeIndexPath = path.relative(cwd, indexPath).replace(/\\/g, '/');
      if (!relativeIndexPath.startsWith('./') && !relativeIndexPath.startsWith('../')) {
        relativeIndexPath = './' + relativeIndexPath;
      }
      
      let relativeDirPath = path.relative(cwd, dirPath).replace(/\\/g, '/');
      if (!relativeDirPath.startsWith('./') && !relativeDirPath.startsWith('../')) {
        relativeDirPath = './' + relativeDirPath;
      }

      // Dual mapping: base points to index, wildcard points to directory
      pathsObj[`@${domainName}`] = [relativeIndexPath];
      pathsObj[`@${domainName}/*`] = [`${relativeDirPath}/*`];
    }
  }

  // 3. Register manual custom aliases 
  if (config.aliases) {
    for (const [alias, target] of Object.entries(config.aliases)) {
      // 3.1 Normalize target path to posix relative
      let normalizedTarget = path.isAbsolute(target) ? path.relative(cwd, target) : target;
      normalizedTarget = normalizedTarget.replace(/\\/g, '/');
      if (!normalizedTarget.startsWith('./') && !normalizedTarget.startsWith('../')) {
        normalizedTarget = './' + normalizedTarget;
      }

      // 3.2 Determine if target is a file or directory
      // We check for extensions and for physical existence if possible
      const isExplicitFile = /\.(ts|js|mts|mjs|cts|cjs|json)$/.test(normalizedTarget);
      
      const cleanAlias = alias.replace(/\/\*$/, '');
      const cleanTarget = normalizedTarget.replace(/\/\*$/, '');

      if (isExplicitFile) {
        // For files, only use the exact mapping
        pathsObj[cleanAlias] = [cleanTarget];
      } else {
        // For directories, provide dual mapping (N-09)
        // Base mapping points to the directory/index if it looks like a folder
        pathsObj[cleanAlias] = [cleanTarget];
        pathsObj[`${cleanAlias}/*`] = [`${cleanTarget}/*`];
      }
    }
  }

  return pathsObj;
}
