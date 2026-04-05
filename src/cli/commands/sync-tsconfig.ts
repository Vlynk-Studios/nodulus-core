import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import fg from 'fast-glob';
import { parse, stringify } from 'comment-json';
import { loadConfig } from '../../core/config.js';

export function syncTsconfigCommand() {
  return new Command('sync-tsconfig')
    .description('Syncs Nodulus aliases into tsconfig.json paths array for IDE support')
    .option('--tsconfig <path>', 'Path to tsconfig.json', 'tsconfig.json')
    .action(async (options: { tsconfig: string }) => {
      try {
        const cwd = process.cwd();
        const configPath = path.resolve(cwd, options.tsconfig);

        if (!fs.existsSync(configPath)) {
          console.error(pc.red(`\nError: Could not find ${options.tsconfig} at ${configPath}\n`));
          process.exit(1);
        }

        // 1. Load Nodulus config
        const config = await loadConfig();

        // 2. Scan module glob to find discovered modules
        const globPattern = config.modules.replace(/\\/g, '/');
        const moduleDirs = await fg(globPattern, {
          onlyDirectories: true,
          absolute: true,
          cwd
        });

        moduleDirs.sort();

        // 3. Build paths mapping object
        const pathsObj: Record<string, string[]> = {};

        // 3a. Register built-in module aliases
        for (const dirPath of moduleDirs) {
          const modName = path.basename(dirPath);
          const aliasKey = `@modules/${modName}`;
          
          let indexPath = path.join(dirPath, 'index.ts');
          if (!fs.existsSync(indexPath)) {
            indexPath = path.join(dirPath, 'index.js');
          }

          // Use posix separated paths
          let relativePosixPath = path.relative(cwd, indexPath).replace(/\\/g, '/');
          if (!relativePosixPath.startsWith('./') && !relativePosixPath.startsWith('../')) {
            relativePosixPath = './' + relativePosixPath;
          }
          
          pathsObj[aliasKey] = [relativePosixPath];
        }

        // 3b. Register folder/project aliases explicitly set in config
        if (config.aliases) {
          for (const [alias, target] of Object.entries(config.aliases)) {
            let relativePosixPath = path.isAbsolute(target) ? path.relative(cwd, target) : target;
            relativePosixPath = relativePosixPath.replace(/\\/g, '/');
            if (!relativePosixPath.startsWith('./') && !relativePosixPath.startsWith('../')) {
              relativePosixPath = './' + relativePosixPath;
            }

            // Append /* for standard TypeScript folder completion mapping
            const key = alias.endsWith('/*') ? alias : `${alias}/*`;
            const val = relativePosixPath.endsWith('/*') ? relativePosixPath : `${relativePosixPath}/*`;
            
            pathsObj[key] = [val];
          }
        }

        // 4. Update TS Config
        const rawContent = fs.readFileSync(configPath, 'utf8');
        const tsconfig = parse(rawContent) as any;

        if (!tsconfig.compilerOptions) {
          tsconfig.compilerOptions = {};
        }

        if (!tsconfig.compilerOptions.paths) {
          tsconfig.compilerOptions.paths = {};
        }

        // 4a. Clean up stale Nodulus managed modules that were deleted
        for (const key of Object.keys(tsconfig.compilerOptions.paths)) {
          if (key.startsWith('@modules/') && !pathsObj[key]) {
            delete tsconfig.compilerOptions.paths[key];
          }
        }

        // Merge paths overwriting existing Nodulus-managed keys safely
        Object.assign(tsconfig.compilerOptions.paths, pathsObj);

        // Sort keys purely for visual aesthetics
        const sortedPaths: Record<string, any> = {};
        Object.keys(tsconfig.compilerOptions.paths)
          .sort()
          .forEach((k) => {
            sortedPaths[k] = tsconfig.compilerOptions.paths[k];
          });
        
        tsconfig.compilerOptions.paths = sortedPaths;

        // 5. Save preserving comments
        fs.writeFileSync(configPath, stringify(tsconfig, null, 2) + '\n', 'utf8');

        // 6. Pretty Output Calculation
        const moduleCount = Object.keys(pathsObj).filter(k => k.startsWith('@modules/')).length;
        const aliasCount = Object.keys(pathsObj).length - moduleCount;

        console.log(pc.green(`\n✔ tsconfig.json updated — ${moduleCount} module(s), ${aliasCount} folder alias(es)`));
        console.log(`Added paths:`);
        
        // Find longest key for padding alignment
        const maxKeyLength = Math.max(...Object.keys(pathsObj).map(k => k.length));
        
        for (const [key, paths] of Object.entries(pathsObj)) {
          const paddedKey = key.padEnd(maxKeyLength);
          console.log(`  ${pc.cyan(paddedKey)}  → ${paths[0]}`);
        }
        console.log('');
      } catch (err: any) {
        console.error(pc.red(`\nError synchronizing tsconfig: ${err.message}\n`));
        process.exit(1);
      }
    });
}
