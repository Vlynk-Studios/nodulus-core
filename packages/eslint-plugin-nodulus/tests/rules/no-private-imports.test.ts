import { RuleTester } from 'eslint';
import { describe, it, afterAll, vi } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as tsParser from '@typescript-eslint/parser';
import rule from '../../src/rules/no-private-imports.js';
import { clearAllResolverCaches } from '../../src/utils/module-resolver.js';

RuleTester.describe = describe;
RuleTester.it = it;

function setupModuleTree(root: string): string {
  const writeModule = (name: string, files: Record<string, string>) => {
    const moduleDir = path.join(root, 'src', 'modules', name);
    fs.mkdirSync(moduleDir, { recursive: true });
    fs.writeFileSync(
      path.join(moduleDir, 'index.ts'),
      `import { Module } from '@vlynk-studios/nodulus-core';\nModule('${name}', { imports: [] });`,
    );
    for (const [rel, content] of Object.entries(files)) {
      const filePath = path.join(moduleDir, rel);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }
  };

  writeModule('users', {
    'users.service.ts': "import { P } from '../payments/payments.service';",
  });
  writeModule('payments', {
    'payments.service.ts': 'export class P {}',
  });

  return path.join(root, 'src/modules/users/users.service.ts');
}

function setupCustomModulesDir(root: string): string {
  const customModules = path.join(root, 'custom-modules');
  fs.mkdirSync(path.join(customModules, 'orders'), { recursive: true });
  fs.mkdirSync(path.join(customModules, 'users'), { recursive: true });
  fs.writeFileSync(
    path.join(customModules, 'orders', 'index.ts'),
    "import { Module } from '@vlynk-studios/nodulus-core';\nModule('orders', { imports: [] });",
  );
  fs.writeFileSync(
    path.join(customModules, 'users', 'index.ts'),
    "import { Module } from '@vlynk-studios/nodulus-core';\nModule('users', { imports: [] });",
  );
  const ordersFile = path.join(customModules, 'orders', 'orders.service.ts');
  fs.writeFileSync(ordersFile, "import { U } from '../users/users.service';");
  fs.writeFileSync(path.join(customModules, 'users', 'users.service.ts'), 'export class U {}');
  return ordersFile;
}

const diskRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-private-disk-'));
const usersFile = setupModuleTree(diskRoot);

const diskTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const projectRootOption = [{ projectRoot: diskRoot }];

diskTester.run('no-private-imports — relative boundary via Module()', rule, {
  valid: [
    {
      code: "import { x } from './users.repository';",
      filename: usersFile,
      options: projectRootOption,
    },
  ],
  invalid: [
    {
      code: "import { P } from '../payments/payments.service';",
      filename: usersFile,
      options: projectRootOption,
      errors: [
        {
          messageId: 'relativeBoundary',
          data: { path: '../payments/payments.service', target: 'payments' },
        },
      ],
    },
  ],
});

const customDirRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-private-custom-'));
const customOrdersFile = setupCustomModulesDir(customDirRoot);

const customTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

customTester.run('no-private-imports — modulesDir option', rule, {
  valid: [],
  invalid: [
    {
      code: "import { U } from '../users/users.service';",
      filename: customOrdersFile,
      options: [{ modulesDir: 'custom-modules', projectRoot: customDirRoot }],
      errors: [
        {
          messageId: 'relativeBoundary',
          data: { path: '../users/users.service', target: 'users' },
        },
      ],
    },
  ],
});

afterAll(() => {
  vi.restoreAllMocks();
  clearAllResolverCaches();
  fs.rmSync(diskRoot, { recursive: true, force: true });
  fs.rmSync(customDirRoot, { recursive: true, force: true });
});

const testerJs = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const testerTs = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parser: tsParser,
  },
});

const validCases = [
  { code: "import { UserService } from '@modules/users';" },
  { code: "import express from 'express';" },
  { code: "import { something } from './local-file.js';", filename: 'src/modules/users/service.ts' },
];

const invalidCases = [
  {
    code: "import { Repo } from '@modules/users/users.repository.js';",
    errors: [{ messageId: 'noPrivateImport', data: { path: '@modules/users/users.repository.js' } }],
  },
  {
    code: "import { schema } from '@modules/auth/schemas/auth.schema.ts';",
    errors: [{ messageId: 'noPrivateImport', data: { path: '@modules/auth/schemas/auth.schema.ts' } }],
  },
  {
    code: "import helper from '@modules/payments/internal/utils/helper.js';",
    errors: [{ messageId: 'noPrivateImport', data: { path: '@modules/payments/internal/utils/helper.js' } }],
  },
];

testerJs.run('no-private-imports (JS)', rule, {
  valid: validCases,
  invalid: invalidCases,
});

testerTs.run('no-private-imports (TS)', rule, {
  valid: validCases,
  invalid: invalidCases,
});
