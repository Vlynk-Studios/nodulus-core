#!/usr/bin/env node
import { Command } from 'commander'
import { createModuleCommand } from './commands/create-module.js'
import { syncTsconfigCommand } from './commands/sync-tsconfig.js'

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

const program = new Command()
program.name('nodulus').description('Nodulus CLI').version(pkg.version)
program.addCommand(createModuleCommand())
program.addCommand(syncTsconfigCommand())

program.parse()
