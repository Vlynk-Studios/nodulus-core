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
  // Step 1 — Load configuration
  const config = await loadConfig(options);

  // Step 2 — Resolve modules
  const globPattern = config.modules.replace(/\\/g, '/');
  const moduleDirs = await fg(globPattern, {
    onlyDirectories: true,
    absolute: true,
    cwd: process.cwd()
  });

  // Ensure strict alphabetical ordering
  moduleDirs.sort();

  // Store useful resolved paths for the upcoming steps
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

  // Step 3 — Activate runtime aliases
  if (config.resolveAliases !== false) {
    const hookAliases: Record<string, string> = { ...config.aliases };
    
    // Automatically resolve @modules/<name> for each module
    for (const mod of resolvedModules) {
      const modName = path.basename(mod.dirPath);
      const aliasKey = `@modules/${modName}`;
      hookAliases[aliasKey] = mod.dirPath;
      registry.registerAlias(aliasKey, mod.dirPath);
    }

    // Register the hook only once — private flag avoids duplicate registers
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

  // Step 4 — Import modules
  for (const mod of resolvedModules) {
    let imported: any;
    try {
      imported = await import(pathToFileURL(mod.indexPath).href);
    } catch (importErr: any) {
      // DUPLICATE_MODULE will be explicitly thrown from inside Module() upon conflict.
      throw importErr; 
    }

    // Correlate the imported module with the one added to the registry based on dirPath
    const allRegistered = registry.getAllModules();
    const registeredMod = allRegistered.find(m => m.path === mod.dirPath);

    if (!registeredMod) {
      throw new NodulusError(
        'MODULE_NOT_FOUND',
        `No index.ts found calling Module(). Add Module() to the module's index.ts.`,
        `File: ${mod.indexPath}`
      );
    }

    // Validate Exports
    // CJS/ESM behavior: on dynamic imports, named exports are mapped as object keys.
    const actualExports = Object.keys(imported).filter(key => key !== 'default');
    const declaredExports = registeredMod.exports || [];

    for (const declared of declaredExports) {
      if (!actualExports.includes(declared)) {
        throw new NodulusError(
          'EXPORT_MISMATCH',
          `A name declared in exports does not exist as a real export of index.ts.`,
          `Module: ${registeredMod.name}, Missing Export: ${declared}`
        );
      }
    }

    if (config.strict) {
      for (const actual of actualExports) {
        if (!declaredExports.includes(actual)) {
          config.logger(
            'warn', 
            `Strict Mode: Module "${registeredMod.name}" exports "${actual}" but it is not declared in Module() options "exports" array.`
          );
        }
      }
    }
  }

  // Step 5 — Validate dependencies
  const allModules = registry.getAllModules();
  for (const mod of allModules) {
    for (const importName of mod.imports) {
      if (!registry.hasModule(importName)) {
        throw new NodulusError(
          'MISSING_IMPORT',
          `A module declared in imports does not exist in the registry.`,
          `Module "${mod.name}" is trying to import missing module "${importName}"`
        );
      }
    }
  }

  // Strict mode validations for circular dependencies
  if (config.strict) {
    const cycles = registry.findCircularDependencies();
    if (cycles.length > 0) {
      const cycleStrings = cycles.map(cycle => cycle.join(' -> ')).join(' | ');
      throw new NodulusError(
        'CIRCULAR_DEPENDENCY',
        `Circular dependency detected. Extract the shared dependency into a separate module.`,
        `Cycles found: ${cycleStrings}`
      );
    }
  }

  // Placeholder for the upcoming blocks
  throw new Error('createApp() — more steps pending...');
}
