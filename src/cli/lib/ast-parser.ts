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

export function extractModuleDeclaration(
  indexPath: string,
): ModuleDeclaration | null {
  let found: ModuleDeclaration | null = null;

  try {
    const code = fs.readFileSync(indexPath, "utf-8");
    const ast = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });

    walk.simple(ast, {
      CallExpression(node: any) {
        if (node.callee && node.callee.name === "Module") {
          const nameArg = node.arguments[0];
          if (nameArg && nameArg.type === "Literal") {
            const name = nameArg.value;
            const imports: string[] = [];

            const optionsArg = node.arguments[1];
            if (optionsArg && optionsArg.type === "ObjectExpression") {
              for (const prop of optionsArg.properties) {
                const isImportsKey =
                  (prop.key.type === "Identifier" &&
                    prop.key.name === "imports") ||
                  (prop.key.type === "Literal" && prop.key.value === "imports");

                if (isImportsKey && prop.value.type === "ArrayExpression") {
                  for (const elem of prop.value.elements) {
                    if (elem && elem.type === "Literal") {
                      imports.push(elem.value);
                    }
                  }
                }
              }
            }

            found = { name, imports };
          }
        }
      },
    });
  } catch (_error) {
    // If the parser fails, return null or skip
    return null;
  }

  return found;
}
