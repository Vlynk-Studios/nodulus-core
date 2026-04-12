import * as fs from "node:fs";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import type { ImportDeclaration, CallExpression, Literal, ObjectExpression, ArrayExpression } from 'estree';

// Note about TypeScript and acorn parsing:
// Acorn does not support TS syntax natively — if parsing fails, the file is silently skipped;
// for compiled TS projects, it is recommended to parse the JS output from the `dist/` folder.

export interface ImportFound {
  specifier: string;
  line: number;
  file: string;
}

export interface IdentifierCall {
  name: string;
  options: Record<string, unknown>;
}

export interface ModuleDeclaration {
  name: string;
  imports: string[];
}

export function extractModuleImports(filePath: string): ImportFound[] {
  const imports: ImportFound[] = [];

  try {
    const code = fs.readFileSync(filePath, "utf-8");
    const ast = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });

    walk.simple(ast, {
      ImportDeclaration(node) {
        const imp = node as unknown as ImportDeclaration;
        if (imp.source && typeof imp.source.value === "string") {
          const specifier = imp.source.value;
          if (specifier.startsWith("@")) {
            const excludedScopes = [
              "@types",
              "@typescript-eslint",
              "@vitest",
              "@eslint",
              "@nestjs",
              "@angular",
              "@babel",
              "@jest",
              "@testing-library",
              "@vitejs",
              "@swc",
              "@puppeteer",
              "@playwright"
            ];
            
            const isExcluded = excludedScopes.some(scope => specifier.startsWith(scope + "/") || specifier === scope);
            
            if (!isExcluded) {
              imports.push({
                specifier,
                line: imp.loc?.start.line || 0,
                file: filePath,
              });
            }
          }
        }
      },
    });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
       // Silently skip if file doesn't exist (can happen with dynamic paths)
       return [];
    }
    console.warn(`[Nodulus] [Parser] Warning: Failed to parse imports in "${filePath}".`);
    console.debug(`  Detail: ${error.message}`);
    return [];
  }

  return imports;
}

export function extractIdentifierCall(
  filePath: string,
  calleeName: 'Module' | 'Domain' | 'SubModule' | 'DomainShared'
): IdentifierCall | null {
  let found: IdentifierCall | null = null;

  try {
    const code = fs.readFileSync(filePath, "utf-8");
    const ast = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });

    walk.simple(ast, {
      CallExpression(node) {
        const call = node as unknown as CallExpression;
        if (call.callee.type === 'Identifier' && call.callee.name === calleeName) {
          const nameArg = call.arguments[0] as Literal;
          if (nameArg && nameArg.type === "Literal") {
            const name = nameArg.value as string;
            const options: Record<string, unknown> = {};

            const optionsArg = call.arguments[1] as ObjectExpression;
            if (optionsArg && optionsArg.type === "ObjectExpression") {
              for (const prop of optionsArg.properties) {
                if (prop.type !== 'Property') continue;
                
                let keyName = '';
                if (prop.key.type === "Identifier") {
                  keyName = prop.key.name;
                } else if (prop.key.type === "Literal") {
                  keyName = String(prop.key.value);
                }

                if (keyName && prop.value.type === "ArrayExpression") {
                  const arr: string[] = [];
                  const arrayVal = prop.value as ArrayExpression;
                  for (const elem of arrayVal.elements) {
                    if (elem && elem.type === "Literal") {
                      arr.push(String(elem.value));
                    }
                  }
                  options[keyName] = arr;
                } else if (keyName && prop.value.type === "Literal") {
                  options[keyName] = prop.value.value;
                }
              }
            }

            found = { name, options };
          }
        }
      },
    });
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.warn(`[Nodulus] [Parser] Warning: Failed to parse identifier call in "${filePath}".`);
      console.debug(`  Detail: ${error.message}`);
    }
    return null;
  }

  return found;
}

export function extractModuleDeclaration(
  indexPath: string,
): ModuleDeclaration | null {
  const result = extractIdentifierCall(indexPath, 'Module');
  if (!result) return null;

  return {
    name: result.name,
    imports: Array.isArray(result.options.imports) ? (result.options.imports as string[]) : [],
  };
}

/**
 * Extracts all Nodulus identifier names (Service, Controller, Repository, Schema) 
 * called in a source file. Used for NITS identity similarity tracking.
 */
export function extractInternalIdentifiers(filePath: string): string[] {
  const names: string[] = [];
  const targetCallees = ['Service', 'Controller', 'Repository', 'Schema'];

  try {
    const code = fs.readFileSync(filePath, "utf-8");
    const ast = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
    });

    walk.simple(ast, {
      CallExpression(node) {
        const call = node as unknown as CallExpression;
        if (call.callee.type === 'Identifier' && targetCallees.includes(call.callee.name)) {
          const nameArg = call.arguments[0] as Literal;
          if (nameArg && nameArg.type === "Literal" && typeof nameArg.value === 'string') {
            names.push(nameArg.value);
          }
        }
      },
    });
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.warn(`[Nodulus] [Parser] Warning: Failed to parse internal identifiers in "${filePath}".`);
      console.debug(`  Detail: ${error.message}`);
    }
  }

  return names;
}
