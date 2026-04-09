import * as fs from "node:fs";
import * as acorn from "acorn";
import * as walk from "acorn-walk";

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
      ImportDeclaration(node: any) {
        if (node.source && typeof node.source.value === "string") {
          const specifier = node.source.value;
          if (specifier.startsWith("@modules/")) {
            imports.push({
              specifier,
              line: node.loc?.start.line || 0,
              file: filePath,
            });
          }
        }
      },
    });
  } catch (_error) {
    // If the parser fails (e.g. complex TS unsupported by acorn), skip the analysis
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
      CallExpression(node: any) {
        if (node.callee && node.callee.name === calleeName) {
          const nameArg = node.arguments[0];
          if (nameArg && nameArg.type === "Literal") {
            const name = nameArg.value;
            const options: Record<string, unknown> = {};

            const optionsArg = node.arguments[1];
            if (optionsArg && optionsArg.type === "ObjectExpression") {
              for (const prop of optionsArg.properties) {
                let keyName = '';
                if (prop.key.type === "Identifier") {
                  keyName = prop.key.name;
                } else if (prop.key.type === "Literal") {
                  keyName = String(prop.key.value);
                }

                if (keyName && prop.value.type === "ArrayExpression") {
                  const arr: string[] = [];
                  for (const elem of prop.value.elements) {
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
  } catch (_error) {
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
