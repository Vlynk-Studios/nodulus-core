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

      let relativePosixPath = path.relative(cwd, indexPath).replace(/\\/g, '/');
      if (!relativePosixPath.startsWith('./') && !relativePosixPath.startsWith('../')) {
        relativePosixPath = './' + relativePosixPath;
      }
      
      pathsObj[aliasKey] = [relativePosixPath];
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
      
      let relativePosixPath = path.relative(cwd, indexPath).replace(/\\/g, '/');
      if (!relativePosixPath.startsWith('./') && !relativePosixPath.startsWith('../')) {
        relativePosixPath = './' + relativePosixPath;
      }
      
      let dirRelative = path.relative(cwd, dirPath).replace(/\\/g, '/');
      if (!dirRelative.startsWith('./') && !dirRelative.startsWith('../')) {
        dirRelative = './' + dirRelative;
      }

      pathsObj[`@${domainName}`] = [relativePosixPath];
      pathsObj[`@${domainName}/*`] = [`${dirRelative}/*`];
    }
  }

  // 3. Register manual custom aliases 
  if (config.aliases) {
    for (const [alias, target] of Object.entries(config.aliases)) {
      let relativePosixPath = path.isAbsolute(target) ? path.relative(cwd, target) : target;
      relativePosixPath = relativePosixPath.replace(/\\/g, '/');
      if (!relativePosixPath.startsWith('./') && !relativePosixPath.startsWith('../')) {
        relativePosixPath = './' + relativePosixPath;
      }

      const key = alias.endsWith('/*') ? alias : `${alias}/*`;
      const val = relativePosixPath.endsWith('/*') ? relativePosixPath : `${relativePosixPath}/*`;
      
      pathsObj[key] = [val];
    }
  }

  return pathsObj;
}
