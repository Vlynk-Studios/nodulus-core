import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';

export function syncTsconfigCommand() {
  return new Command('sync-tsconfig')
    .description('Syncs Nodulus aliases into tsconfig.json paths array for IDE support')
    .option('--tsconfig <path>', 'Path to tsconfig.json', 'tsconfig.json')
    .action(async (options: { tsconfig: string }) => {
      const configPath = path.resolve(process.cwd(), options.tsconfig);

      if (!fs.existsSync(configPath)) {
        console.error(pc.red(`\nError: Could not find ${options.tsconfig} at ${configPath}\n`));
        process.exit(1);
      }

      console.log(pc.green(`\n✔ Command 'sync-tsconfig' initialized for: ${options.tsconfig}\n`));
      
      // TODO: Implementation for parsing tsconfig.json and injecting aliases
      // will be added here based on the next set of instructions.
    });
}
