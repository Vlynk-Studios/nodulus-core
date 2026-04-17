import fs from 'node:fs';
import path from 'node:path';
import type { Rule } from 'eslint';
import { getModuleImports } from '../utils/module-resolver.js';

let cachedAliases: string[] | null = null;
function getRecognizedAliases(cwd: string): string[] {
  if (cachedAliases) return cachedAliases;
  const scopes = new Set<string>(['@modules']);
  try {
    const tsconfigPath = path.join(cwd, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      const content = fs.readFileSync(tsconfigPath, 'utf8');
      const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const tsconfig = JSON.parse(cleanContent);
      if (tsconfig?.compilerOptions?.paths) {
        Object.keys(tsconfig.compilerOptions.paths).forEach(p => {
          if (p.startsWith('@')) {
            const scope = p.split('/')[0];
            scopes.add(scope);
          }
        });
      }
    }
  } catch (_e) {
    // Silent fallback to default
  }
  cachedAliases = Array.from(scopes);
  return cachedAliases;
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Ensure cross-module and cross-domain imports are explicitly declared securely.',
      recommended: true,
    },
    messages: {
      undeclaredImport: 'Module "{{target}}" is not declared in the imports array of your module definition.',
      undeclaredDomainImport: 'Domain/Alias dependency "{{target}}" is not declared. (Will be an error in v2.0)',
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

    const recognizedAliases = getRecognizedAliases(context.cwd || process.cwd());

    return {
      ImportDeclaration(node: any) {
        if (!node.source || typeof node.source.value !== 'string') {
          return;
        }

        const specifier = node.source.value;

        // Skip non-alias imports like relative paths or pure npm packages (express, lodash)
        if (!specifier.startsWith('@')) {
          return;
        }

        const currentScope = specifier.split('/')[0];

        if (!recognizedAliases.includes(currentScope)) {
          return;
        }

        const parts = specifier.split('/');
        
        // Depth logic > 2 handled by no-private-imports rule
        if (parts.length > 2) {
          return;
        }

        // Target resolving depending if it's a @modules pattern or a @domain pattern
        let targetModule = parts[1];
        let messageId = 'undeclaredImport';

        if (currentScope !== '@modules') {
          // If it's something like @auth/user-service, the target is user-service
          // If it's just @auth, the target is auth
          targetModule = (parts[1] || parts[0]).replace(/^@/, '');
          messageId = 'undeclaredDomainImport';
        }

        if (!targetModule) return;

        if (!declaredImports.includes(targetModule)) {
          context.report({
            node,
            messageId,
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
