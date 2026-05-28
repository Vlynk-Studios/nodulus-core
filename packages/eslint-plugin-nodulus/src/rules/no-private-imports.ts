import path from 'node:path';
import type { Rule } from 'eslint';
import {
  findModuleRoot,
  inferCrossModuleTarget,
  isRelativeBoundaryCrossing,
} from '../utils/module-resolver.js';

interface RuleOptions {
  modulesDir?: string;
  /** Project root for resolving modules and config. Defaults to ESLint cwd. */
  projectRoot?: string;
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow deep @-alias imports and relative imports that cross module boundaries.',
      recommended: true,
    },
    messages: {
      noPrivateImport:
        'Private import detected: "{{path}}". Use the public index of the module.',
      relativeBoundary:
        'Relative path "{{path}}" crosses the module boundary. Use @modules/{{target}} instead.',
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

    function getFilePath(): string | null {
      const filepath =
        context.filename ||
        (context as { physicalFilename?: string }).physicalFilename ||
        (context as { getFilename?: () => string }).getFilename?.();
      return typeof filepath === 'string' ? filepath : null;
    }

    return {
      ImportDeclaration(node: { source?: { value?: unknown } }) {
        if (!node.source || typeof node.source.value !== 'string') {
          return;
        }

        const specifier = node.source.value;
        const filePath = getFilePath();
        if (!filePath) return;

        if (specifier.startsWith('./') || specifier.startsWith('../')) {
          const moduleRoot = findModuleRoot(filePath, cwd, modulesDir);
          if (!moduleRoot) return;

          if (isRelativeBoundaryCrossing(specifier, filePath, moduleRoot)) {
            const resolved = path.resolve(path.dirname(path.resolve(filePath)), specifier);
            const target = inferCrossModuleTarget(resolved, moduleRoot, modulesDir, cwd);
            context.report({
              node: node as Rule.Node,
              messageId: 'relativeBoundary',
              data: { path: specifier, target },
            });
          }
          return;
        }

        if (!specifier.startsWith('@modules/')) {
          return;
        }

        const parts = specifier.split('/');
        if (parts.length > 2) {
          context.report({
            node: node as Rule.Node,
            messageId: 'noPrivateImport',
            data: { path: specifier },
          });
        }
      },
    };
  },
};

export default rule;
