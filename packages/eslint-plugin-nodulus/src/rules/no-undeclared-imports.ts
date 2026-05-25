import type { Rule } from 'eslint';
import {
  getActiveNodulusAliases,
  getModuleImports,
  isNodulusAlias,
} from '../utils/module-resolver.js';

interface RuleOptions {
  modulesDir?: string;
  projectRoot?: string;
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Ensure cross-module imports use declared dependencies (REGLA-22 alias inclusion).',
      recommended: true,
    },
    messages: {
      undeclaredImport:
        'Module "{{target}}" is not declared in the imports array of your module definition.',
      undeclaredDomainImport:
        'Domain/Alias dependency "{{target}}" is not declared. (Will be an error in v2.0)',
    },
    schema: [
      {
        type: 'object',
        properties: {
          modulesDir: { type: 'string' },
          projectRoot: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = (context.options[0] ?? {}) as RuleOptions;
    const modulesDir = options.modulesDir;
    const cwd = options.projectRoot ?? context.cwd ?? process.cwd();

    const filename =
      context.filename ||
      (context as { physicalFilename?: string }).physicalFilename ||
      (context as { getFilename?: () => string }).getFilename?.();
    if (typeof filename !== 'string') {
      return {};
    }

    const declaredImports = getModuleImports(filename, { modulesDir, cwd });

    if (declaredImports === null) {
      return {};
    }

    const activeAliases = getActiveNodulusAliases(cwd);

    return {
      ImportDeclaration(node: { source?: { value?: unknown } }) {
        if (!node.source || typeof node.source.value !== 'string') {
          return;
        }

        const specifier = node.source.value;

        if (!isNodulusAlias(specifier, activeAliases)) {
          return;
        }

        const parts = specifier.split('/');

        // Depth > 2 handled by no-private-imports
        if (parts.length > 2) {
          return;
        }

        const scope = parts[0];
        let targetModule = parts[1];
        let messageId: 'undeclaredImport' | 'undeclaredDomainImport' = 'undeclaredImport';

        if (scope !== '@modules') {
          targetModule = scope.replace(/^@/, '');
          messageId = 'undeclaredDomainImport';
        }

        if (!targetModule) return;

        if (!declaredImports.includes(targetModule)) {
          context.report({
            node: node as Rule.Node,
            messageId,
            data: { target: targetModule },
          });
        }
      },
    };
  },
};

export default rule;
