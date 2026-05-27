import fs from 'node:fs';
import path from 'node:path';
import { stringify } from 'comment-json';
import type { ResolvedConfig, Logger } from '../types/index.js';

export async function generateTsConfigNodulus(config: ResolvedConfig, cwd: string, logger?: Logger): Promise<void> {
  const tsconfigPath = path.join(cwd, 'tsconfig.nodulus.json');
  const mainTsconfigPath = path.join(cwd, 'tsconfig.json');

  if (!fs.existsSync(mainTsconfigPath) && logger) {
    logger.info('No tsconfig.json found in project root. You should create one and extend "./tsconfig.nodulus.json".', { _module: 'alias' });
  }

  // Built-in @modules alias
  const modulesTarget = config.modules; // e.g. "src/modules/*"
  
  const paths: Record<string, string[]> = {
    "@modules/*": [modulesTarget],
  };

  // User-defined aliases from nodulus.config.ts
  for (const [alias, target] of Object.entries(config.aliases)) {
    // Avoid re-adding @modules just in case
    if (alias === '@modules') continue;

    const isWildcard = target.endsWith('/*');
    const cleanTarget = isWildcard ? target.slice(0, -2) : target;
    // For tsconfig paths we usually want them relative to the baseUrl (which is usually .)
    // Since nodulus.config.ts paths are either relative or absolute, we make sure they are relative to cwd for tsconfig
    let relativeTarget = target;
    if (path.isAbsolute(cleanTarget)) {
       relativeTarget = path.relative(cwd, cleanTarget).replace(/\\/g, '/');
       if (isWildcard) relativeTarget += '/*';
    }

    if (alias.endsWith('/*')) {
      paths[alias] = [relativeTarget];
    } else {
      // It's a file or directory alias without wildcard
      paths[alias] = [relativeTarget];
      
      // Auto-subpaths if it's a directory (not ending in /*)
      // We check if it resolves to a directory.
      // Wait, in createApp.ts we verify if it's a directory.
      const targetAbs = path.resolve(cwd, cleanTarget);
      if (fs.existsSync(targetAbs)) {
         const stats = fs.statSync(targetAbs);
         if (stats.isDirectory()) {
            paths[`${alias}/*`] = [`${relativeTarget}/*`];
         }
      }
    }
  }

  const generatedConfig = {
    compilerOptions: {
      paths
    }
  };

  const newContent = stringify(generatedConfig, null, 2) + '\n';

  if (fs.existsSync(tsconfigPath)) {
    const existingContent = fs.readFileSync(tsconfigPath, 'utf8');
    if (existingContent === newContent) {
      return; // No changes needed, skip write to save I/O
    }
  }

  fs.writeFileSync(tsconfigPath, newContent, 'utf8');
  if (logger) {
    logger.debug('Generated tsconfig.nodulus.json', { _module: 'alias' });
  }
}
