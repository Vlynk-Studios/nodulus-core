import fg from 'fast-glob';
import path from 'node:path';
import fs from 'node:fs';
import { extractModuleDeclaration, extractModuleImports, ImportFound } from './ast-parser.js';

export interface ModuleNode {
  name: string;
  dirPath: string;
  indexPath: string;
  declaredImports: string[];
  actualImports: ImportFound[];
}

export async function buildModuleGraph(modulesGlob: string | string[], cwd: string): Promise<ModuleNode[]> {
  const dirs = await fg(modulesGlob, { cwd, onlyDirectories: true, absolute: true });
  const nodes: ModuleNode[] = [];

  for (const dirPath of dirs) {
    let indexPath = path.join(dirPath, 'index.ts');
    if (!fs.existsSync(indexPath)) {
      indexPath = path.join(dirPath, 'index.js');
      if (!fs.existsSync(indexPath)) {
        continue;
      }
    }

    const declaration = extractModuleDeclaration(indexPath);
    if (!declaration) {
      continue;
    }

    const actualImports: ImportFound[] = [];

    const moduleFiles = await fg('**/*.{ts,js,mts,mjs}', {
      cwd: dirPath,
      absolute: true,
      ignore: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts', 'index.*']
    });

    for (const file of moduleFiles) {
      const fileImports = extractModuleImports(file);
      actualImports.push(...fileImports);
    }

    nodes.push({
      name: declaration.name,
      dirPath,
      indexPath,
      declaredImports: declaration.imports,
      actualImports
    });
  }

  return nodes;
}
