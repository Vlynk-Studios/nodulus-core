import type { Rule } from 'eslint';
import { getModuleImports } from '../utils/module-resolver.js';

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Ensure cross-module imports are explicitly declared in the nodulus module definition.',
      recommended: true,
    },
    messages: {
      undeclaredImport: 'Module "{{target}}" is not declared in the imports array of your module definition.',
    },
    schema: [],
  },
  create(context) {
    const filename: string = typeof context.filename === 'string' 
      ? context.filename 
      : (context as any).getFilename();
      
    const declaredImports = getModuleImports(filename);

    if (declaredImports === null) {
      return {};
    }

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
          // Handled by no-private-imports rule
          return;
        }

        const targetModule = parts[1];

        if (!declaredImports.includes(targetModule)) {
          context.report({
            node,
            messageId: 'undeclaredImport',
            data: {
              target: targetModule,
            },
          });
        }
      },
    };
  },
};

export default rule;
