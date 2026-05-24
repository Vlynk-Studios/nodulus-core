import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import * as tsParser from '@typescript-eslint/parser';
import rule from '../../src/rules/no-private-imports.js';

// Vitest integration for RuleTester
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

const validCases = [
  { code: "import { UserService } from '@modules/users';" },
  { code: "import express from 'express';" },
  { code: "import { something } from './local-file.js';", filename: 'src/modules/users/service.ts' },
  { code: "import { utils } from '../utils.js';", filename: 'src/modules/users/sub/service.ts' },
];

const invalidCases = [
  {
    code: "import { Repo } from '@modules/users/users.repository.js';",
    errors: [{ messageId: 'privateImport', data: { module: 'users' } }],
  },
  {
    code: "import { schema } from '@modules/auth/schemas/auth.schema.ts';",
    errors: [{ messageId: 'privateImport', data: { module: 'auth' } }],
  },
  {
    code: "import helper from '@modules/payments/internal/utils/helper.js';",
    errors: [{ messageId: 'privateImport', data: { module: 'payments' } }],
  },
  {
    code: "import { users } from '../../users/service.ts';",
    filename: 'src/modules/orders/services/order.service.ts',
    errors: [{ messageId: 'boundaryViolation', data: { specifier: '../../users/service.ts' } }],
  },
  {
    code: "import { core } from '../../../core/index.ts';",
    filename: 'packages/modules/payments/src/api/handler.ts',
    errors: [{ messageId: 'boundaryViolation', data: { specifier: '../../../core/index.ts' } }],
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
