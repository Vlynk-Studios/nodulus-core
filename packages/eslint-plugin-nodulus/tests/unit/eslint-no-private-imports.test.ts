import { RuleTester } from 'eslint';
import { describe, it, afterAll } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import rule from '../../src/rules/no-private-imports.js';
import { clearAllResolverCaches } from '../../src/utils/module-resolver.js';

RuleTester.describe = describe;
RuleTester.it = it;

const diskRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-boundary-unit-'));

function writeModule(
  root: string,
  name: string,
  files: Record<string, string>,
): void {
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
}

writeModule(diskRoot, 'users', {
  'users.service.ts': "import { P } from '../payments/payments.service';",
  'users.repository.ts': 'export class UsersRepository {}',
});
writeModule(diskRoot, 'payments', {
  'payments.service.ts': 'export class P {}',
});

const usersServiceFile = path.join(diskRoot, 'src/modules/users/users.service.ts');
const outsideModuleFile = path.join(diskRoot, 'src/lib/helper.ts');

fs.mkdirSync(path.dirname(outsideModuleFile), { recursive: true });
fs.writeFileSync(outsideModuleFile, "import { x } from '../algo';");

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const projectRootOption = [{ projectRoot: diskRoot }];

tester.run('eslint-no-private-imports — boundary y alias', rule, {
  valid: [
    {
      code: "import { R } from './users.repository';",
      filename: usersServiceFile,
      options: projectRootOption,
    },
    {
      code: "import { P } from '@modules/payments';",
      filename: usersServiceFile,
      options: projectRootOption,
    },
    {
      code: "import { x } from '../algo';",
      filename: outsideModuleFile,
      options: projectRootOption,
    },
  ],
  invalid: [
    {
      code: "import { P } from '../payments/payments.service';",
      filename: usersServiceFile,
      options: projectRootOption,
      errors: [
        {
          messageId: 'relativeBoundary',
          data: { path: '../payments/payments.service', target: 'payments' },
        },
      ],
    },
    {
      code: "import { internal } from '@modules/payments/internal';",
      filename: usersServiceFile,
      options: projectRootOption,
      errors: [
        {
          messageId: 'noPrivateImport',
          data: { path: '@modules/payments/internal' },
        },
      ],
    },
  ],
});

afterAll(() => {
  clearAllResolverCaches();
  fs.rmSync(diskRoot, { recursive: true, force: true });
});
