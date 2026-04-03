import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import fg from 'fast-glob';
import type { Application } from 'express';
import type { CreateAppOptions, NodulusApp } from '../types/index.js';
import { loadConfig } from '../core/config.js';
import { NodulusError } from '../core/errors.js';
import { registry } from '../core/registry.js';

let isHookRegistered = false;

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

  // Paso 3 — Activar aliases en runtime
  if (config.resolveAliases !== false) {
    const hookAliases: Record<string, string> = { ...config.aliases };
    
    // El hook también resuelve @modules/<name> automáticamente para cada módulo
    for (const mod of resolvedModules) {
      const modName = path.basename(mod.dirPath);
      const aliasKey = `@modules/${modName}`;
      hookAliases[aliasKey] = mod.dirPath;
      registry.registerAlias(aliasKey, mod.dirPath);
    }

    // El hook solo se registra una vez — flag privado
    if (!isHookRegistered) {
      const loaderCode = `
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  const { aliases } = context.data || {};
  if (aliases) {
    for (const alias of Object.keys(aliases)) {
      if (specifier === alias || specifier.startsWith(alias + '/')) {
        const target = aliases[alias];
        const resolvedPath = specifier.replace(alias, target);
        return nextResolve(pathToFileURL(path.resolve(resolvedPath)).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
`;
      try {
        const dataUrl = `data:text/javascript,${encodeURIComponent(loaderCode)}`;
        const parentUrl = typeof __filename === 'undefined' ? import.meta.url : pathToFileURL(__filename).href;
        
        if (typeof register === 'function') {
          register(dataUrl, {
            parentURL: parentUrl,
            data: { aliases: hookAliases }
          });
          isHookRegistered = true;
        } else {
          console.warn('[Nodulus] Warning: node:module register() is not available. ESM aliases might not work. Please upgrade to Node.js >= 20.6.0');
        }
      } catch (err) {
        console.warn('[Nodulus] Warning: Failed to register ESM hook:', err);
      }
    }
  }

  // Placeholder para los siguientes bloques
  throw new Error('createApp() — more steps pending...');
}
