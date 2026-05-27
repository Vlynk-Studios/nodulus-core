import { RuleTester } from 'eslint';
import { describe, it, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import rule from '../../src/rules/no-undeclared-imports.js';
import * as moduleResolver from '../../src/utils/module-resolver.js';

RuleTester.describe = describe;
RuleTester.it = it;

const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-undeclared-cfg-'));
fs.writeFileSync(
  path.join(configRoot, 'nodulus.config.js'),
  "export default { aliases: { '@config': './src/config' } };",
);

afterAll(() => {
  moduleResolver.clearAllResolverCaches();
  fs.rmSync(configRoot, { recursive: true, force: true });
});

const usersIndex = path.join(configRoot, 'src/modules/users/index.ts');
fs.mkdirSync(path.dirname(usersIndex), { recursive: true });
fs.writeFileSync(
  usersIndex,
  "import { Module } from '@vlynk-studios/nodulus-core';\nModule('users', { imports: [] });",
);
const usersService = path.join(configRoot, 'src/modules/users/users.service.ts');
fs.writeFileSync(usersService, "import { db } from '@config/database';");

const testerJs = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

const rootOpt = [{ projectRoot: configRoot }];

testerJs.run('no-undeclared-imports — nodulus.config aliases (REGLA-22)', rule, {
  valid: [{ code: "import express from 'express';", filename: usersService, options: rootOpt }],
  invalid: [
    {
      code: "import { db } from '@config/database';",
      filename: usersService,
      options: rootOpt,
      errors: [{ messageId: 'undeclaredDomainImport', data: { target: 'config' } }],
    },
  ],
});
