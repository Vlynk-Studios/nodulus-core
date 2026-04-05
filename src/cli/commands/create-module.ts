import { Command } from 'commander';

export const createModuleCommand = new Command('create-module')
  .description('Scaffolds a new Nodulus module directory with index, controller and service')
  .argument('<name>', 'Name of the new module to create')
  .action((name: string) => {
    console.log(`Command 'create-module' called for module: ${name}`);
    // Implementation placeholder...
  });
