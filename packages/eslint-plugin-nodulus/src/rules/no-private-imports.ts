import type { Rule } from 'eslint';

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow deep/private imports from other modules. Imports should be made from the public API.',
      recommended: true,
    },
    messages: {
      privateImport: 'Cannot import private internal files from module "{{module}}". You must import from its public root.',
    },
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node: any) {
        if (!node.source || typeof node.source.value !== 'string') {
          return;
        }

        const specifier = node.source.value;

        if (!specifier.startsWith('@modules/')) {
          return;
        }

        const parts = specifier.split('/');

        if (parts.length > 2) {
          context.report({
            node,
            messageId: 'privateImport',
            data: {
              module: parts[1],
            },
          });
        }
      },
    };
  },
};

export default rule;
