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
      boundaryViolation: 'Relative import "{{specifier}}" escapes the module boundary. Use the "@modules/..." alias instead.',
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

        if (specifier.startsWith('../')) {
          const filepath = context.filename || (context.getFilename && context.getFilename());
          if (filepath) {
            const normalizedPath = filepath.replace(/\\/g, '/');
            // Support both standard 'modules' and 'src/modules' or 'packages'
            // We look for a typical module boundary: a directory inside 'modules/'
            const match = normalizedPath.match(/^(.*\/modules\/[^/]+)/);
            if (match) {
              const moduleRoot = match[1];
              const path = require('node:path');
              const resolved = path.posix.join(path.posix.dirname(normalizedPath), specifier);
              if (!resolved.startsWith(moduleRoot + '/') && resolved !== moduleRoot) {
                context.report({
                  node,
                  messageId: 'boundaryViolation',
                  data: { specifier }
                });
              }
            }
          }
          return;
        }

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
