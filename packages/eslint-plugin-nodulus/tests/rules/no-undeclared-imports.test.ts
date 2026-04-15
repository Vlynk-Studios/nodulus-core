import { RuleTester } from 'eslint';
import { describe, it, afterEach, beforeEach, vi } from 'vitest';
import * as tsParser from '@typescript-eslint/parser';
import rule from '../../src/rules/no-undeclared-imports.js';
import * as moduleResolver from '../../src/utils/module-resolver.js';

RuleTester.describe = describe;
RuleTester.it = it;

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

afterEach(() => {
  vi.restoreAllMocks();
  moduleResolver.clearModuleImportsCache();
});

describe('file inside a Nodulus module', () => {
  beforeEach(() => {
    vi.spyOn(moduleResolver, 'getModuleImports').mockReturnValue(['users']);
  });

  const validCases = [
    { code: "import { UserService } from '@modules/users';" },
    { code: "import express from 'express';" },
    { code: "import { something } from './local-file.js';" },
    { code: "import { Private } from '@modules/users/users.service.js';" },
  ];

  const invalidCases = [
    {
      code: "import { PaymentService } from '@modules/payments';",
      errors: [{ messageId: 'undeclaredImport', data: { target: 'payments' } }],
    },
    {
      code: "import auth from '@modules/auth';",
      errors: [{ messageId: 'undeclaredImport', data: { target: 'auth' } }],
    },
  ];

  testerJs.run('no-undeclared-imports (JS) in module', rule, {
    valid: validCases,
    invalid: invalidCases,
  });

  testerTs.run('no-undeclared-imports (TS) in module', rule, {
    valid: validCases,
    invalid: invalidCases,
  });
});

describe('file outside a Nodulus module', () => {
  beforeEach(() => {
    vi.spyOn(moduleResolver, 'getModuleImports').mockReturnValue(null);
  });

  const validCases = [
    { code: "import { PaymentService } from '@modules/payments';" },
  ];

  testerJs.run('no-undeclared-imports (JS) outside module', rule, {
    valid: validCases,
    invalid: [],
  });

  testerTs.run('no-undeclared-imports (TS) outside module', rule, {
    valid: validCases,
    invalid: [],
  });
});
