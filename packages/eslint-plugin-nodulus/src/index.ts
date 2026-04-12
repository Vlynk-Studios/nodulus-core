import type { Linter } from 'eslint';
import noPrivateImports from './rules/no-private-imports.js';
import noUndeclaredImports from './rules/no-undeclared-imports.js';

const defaultRules = {
  'nodulus/no-private-imports': 'error',
  'nodulus/no-undeclared-imports': 'warn',
} satisfies Linter.RulesRecord;

const plugin = {
  meta: {
    name: '@vlynk-studios/eslint-plugin-nodulus',
    version: '1.3.0',
  },
  rules: {
    'no-private-imports': noPrivateImports,
    'no-undeclared-imports': noUndeclaredImports,
  },
  configs: {},
};

plugin.configs = {
  recommended: {
    plugins: { nodulus: plugin },
    rules: defaultRules,
  },
  'recommended-ts': {
    plugins: { nodulus: plugin },
    rules: defaultRules,
  },
};

export default plugin;
