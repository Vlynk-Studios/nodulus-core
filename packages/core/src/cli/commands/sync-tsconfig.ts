import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { parse, stringify } from 'comment-json';
import { loadConfig } from '../../core/config.js';
import { generatePathAliases } from '../lib/tsconfig-generator.js';

interface TsConfig {
  compilerOptions?: {
    paths?: Record<string, string[]>;
  };
}

export function syncTsconfigCommand() {
  return new Command('sync-tsconfig')
    .description('Syncs Nodulus aliases into tsconfig.json paths array for IDE support')
    .option('--tsconfig <path>', 'Path to tsconfig.json', 'tsconfig.json')
    .action(async (options: { tsconfig: string }) => {
      try {
        const cwd = process.cwd();
        const configPath = path.resolve(cwd, options.tsconfig);

        if (!fs.existsSync(configPath)) {
          throw new Error(pc.red(`\nError: Could not find ${options.tsconfig} at ${configPath}\n`));
        }

        // 1. Load Nodulus config
        const config = await loadConfig();

        // 2. Generate paths mapping object via pure functional generator
        const pathsObj = await generatePathAliases(config, cwd);

        // 4. Update TS Config
        const rawContent = await fs.promises.readFile(configPath, 'utf8');
        const tsconfig = parse(rawContent) as unknown as TsConfig;

        if (!tsconfig.compilerOptions) {
          tsconfig.compilerOptions = {};
        }
        const compilerOptions = tsconfig.compilerOptions;

        if (!compilerOptions.paths) {
          compilerOptions.paths = {};
        }
        const paths = compilerOptions.paths;

        // 4a. Clean up stale Nodulus managed modules that were deleted
        for (const key of Object.keys(paths)) {
          const val = paths[key];
          
          if (key.startsWith('@modules/') && !pathsObj[key]) {
            delete paths[key];
          } 
          // Check for stale config aliases using the Nodulus signature format
          else if (
            !pathsObj[key] &&
            key.endsWith('/*') &&
            Array.isArray(val) &&
            val.length === 1 &&
            typeof val[0] === 'string' &&
            (val[0].startsWith('./') || val[0].startsWith('../')) &&
            val[0].endsWith('/*')
          ) {
            delete paths[key];
          }
        }

        // Merge paths overwriting existing Nodulus-managed keys safely
        Object.assign(paths, pathsObj);

        // Sort keys purely for visual aesthetics
        const sortedPaths: Record<string, string[]> = {};
        Object.keys(paths)
          .sort()
          .forEach((k) => {
            sortedPaths[k] = paths[k];
          });
        
        compilerOptions.paths = sortedPaths;

        // 5. Save preserving comments
        fs.writeFileSync(configPath, stringify(tsconfig, null, 2) + '\n', 'utf8');

        // 6. Pretty Output Calculation
        const moduleCount = Object.keys(pathsObj).filter(k => k.startsWith('@modules/')).length;
        const aliasCount = Object.keys(pathsObj).length - moduleCount;

        console.log(pc.green(`\n✔ tsconfig.json updated — ${moduleCount} module(s), ${aliasCount} folder alias(es)`));
        console.log(`Added paths:`);
        
        // Find longest key for padding alignment
        const maxKeyLength = Math.max(...Object.keys(pathsObj).map(k => k.length));
        
        for (const [key, aliasPaths] of Object.entries(pathsObj)) {
          const paddedKey = key.padEnd(maxKeyLength);
          console.log(`  ${pc.cyan(paddedKey)}  → ${aliasPaths[0]}`);
        }
        console.log('');
      } catch (err: any) {
        throw new Error(pc.red(`\nError synchronizing tsconfig: ${err.message}\n`), { cause: err });
      }
    });
}
