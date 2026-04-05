#!/usr/bin/env node
import { Command } from 'commander'
import { createModuleCommand } from './commands/create-module.js'
import { syncTsconfigCommand } from './commands/sync-tsconfig.js'

const program = new Command()
program.name('nodulus').description('Nodulus CLI').version('1.0.0')
program.addCommand(createModuleCommand())
program.addCommand(syncTsconfigCommand())

program.parse()
