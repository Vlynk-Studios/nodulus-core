#!/usr/bin/env node

import { Command } from 'commander';
import { createModuleCommand } from './commands/create-module.js';

const program = new Command();

program
  .name('nodulus')
  .description('Nodulus CLI tool to maintain modules, controllers and boilerplate')
  .version('1.0.0');

// Register commands
program.addCommand(createModuleCommand);

program.parse(process.argv);
