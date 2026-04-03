import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import type { Application } from 'express';
import type { CreateAppOptions, NodulusApp } from '../types/index.js';
import { loadConfig } from '../core/config.js';
import { NodulusError } from '../core/errors.js';

export async function createApp(
  app: Application,
  options: CreateAppOptions = {}
): Promise<NodulusApp> {
  // Paso 1 — Cargar configuración
  const config = await loadConfig(options);

  // Paso 2 — Resolver módulos
  const globPattern = config.modules.replace(/\\/g, '/');
  const moduleDirs = await fg(globPattern, {
    onlyDirectories: true,
    absolute: true,
    cwd: process.cwd()
  });

  // Asegurar ordenamiento alfabético estricto
  moduleDirs.sort();

  // Guardamos un array de paths útiles para los siguientes pasos (opcional, pero útil)
  const resolvedModules: { dirPath: string, indexPath: string }[] = [];

  for (const dirPath of moduleDirs) {
    const tsPath = path.join(dirPath, 'index.ts');
    const jsPath = path.join(dirPath, 'index.js');
    
    let indexPath: string | null = null;
    
    if (fs.existsSync(tsPath)) {
      indexPath = tsPath;
    } else if (fs.existsSync(jsPath)) {
      indexPath = jsPath;
    }

    if (!indexPath) {
      throw new NodulusError(
        'MODULE_NOT_FOUND',
        `No index.ts or index.js found for module. A module directory must have an index file mapping its dependencies.`,
        `Directory: ${dirPath}`
      );
    }
    
    resolvedModules.push({ dirPath, indexPath });
  }

  // Placeholder para los siguientes bloques
  throw new Error('createApp() — more steps pending...');
}
