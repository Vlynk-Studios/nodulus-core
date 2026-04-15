import * as fs from "node:fs";
import path from "node:path";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import fg from "fast-glob";
import type { ImportDeclaration, CallExpression, Literal } from 'estree';
import type { MovedModule, BrokenImport } from "../types/nits.js";

import { calculateAlias } from "./utils.js";

export interface ImportFound {
  specifier: string;
  line: number;
  file: string;
}

/**
 * Extracts external module imports from a file using AST.
 */
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
       return [];
    }
    console.warn(`[Nodulus] [NITS Parser] Warning: Failed to parse imports in "${filePath}".`);
    console.debug(`  Detail: ${error.message}`);
    return [];
  }

  return imports;
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
      console.warn(`[Nodulus] [NITS Parser] Warning: Failed to parse internal identifiers in "${filePath}".`);
      console.debug(`  Detail: ${error.message}`);
    }
  }

  return names;
}


/**
 * Given a list of moved modules, scans the entire project for files that
 * are still importing from the old aliases.
 */
export async function scanBrokenImports(
  movedModules: MovedModule[], 
  projectRoot: string
): Promise<MovedModule[]> {
  if (movedModules.length === 0) return [];

  const files = await fg("**/*.{ts,js,mts,mjs}", {
    cwd: projectRoot,
    absolute: true,
    ignore: [
      "**/node_modules/**", 
      "**/dist/**", 
      "**/*.test.*", 
      "**/*.spec.*", 
      "**/*.d.ts"
    ],
  });

  const movedWithAliases = movedModules.map(m => ({
    ...m,
    oldAlias: calculateAlias(m.oldPath)
  }));

  for (const file of files) {
    const imports = extractModuleImports(file);
    if (imports.length === 0) continue;

    for (const imp of imports) {
      for (const moved of movedWithAliases) {
        const alias = moved.oldAlias;
        // Match exact alias or sub-paths (e.g., @modules/users/types)
        if (imp.specifier === alias || imp.specifier.startsWith(alias + "/")) {
          moved.brokenImports.push({
            file: path.relative(projectRoot, file).replace(/\\/g, '/'),
            line: imp.line,
            specifier: imp.specifier
          });
        }
      }
    }
  }

  // Return original MovedModule structure (without temporary oldAlias)
  return movedWithAliases.map(({ oldAlias, ...m }) => m as MovedModule);
}
