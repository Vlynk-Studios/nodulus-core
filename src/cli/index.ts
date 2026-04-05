#!/usr/bin/env node
import { Command } from 'commander'
import { createModuleCommand } from './commands/create-module.js'

const program = new Command()
program.name('nodulus').description('Nodulus CLI').version('1.0.0')
program.addCommand(createModuleCommand())

program.parse()
