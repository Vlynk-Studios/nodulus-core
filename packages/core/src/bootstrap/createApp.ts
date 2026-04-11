import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fg from 'fast-glob';
import type { Application } from 'express';
import type { CreateAppOptions, NodulusApp } from '../types/index.js';
import { loadConfig } from '../core/config.js';
import { NodulusError } from '../core/errors.js';
import { createRegistry, registryContext } from '../core/registry.js';
import { activateAliasResolver } from '../aliases/resolver.js';
import { updateAliasCache } from '../aliases/cache.js';
import { createLogger } from '../core/logger.js';
import { performance } from 'node:perf_hooks';
import pc from 'picocolors';

export async function createApp(
  app: Application,
  options: CreateAppOptions = {}
): Promise<NodulusApp> {
  // Step 0 — Prevent Duplicate Bootstrap
  if ((app as any).__nodulusBootstrapped) {
    throw new NodulusError(
      'DUPLICATE_BOOTSTRAP',
      'createApp() was called more than once with the same Express instance.'
    );
  }

  // Step 0.5 — ESM Environment Validation
  let isEsm = false;
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.type === 'module') {
        isEsm = true;
      }
    }
  } catch (_e) {
    // Failsafe, could not parse package.json, assume non-ESM to fail securely
  }

  if (!isEsm) {
    throw new NodulusError(
      'INVALID_ESM_ENV',
      'Nodulus requires an ESM environment. Please ensure "type": "module" is present in your root package.json file.'
    );
  }

  const registry = createRegistry();

  return registryContext.run(registry, async () => {
    const startTime = performance.now();
    try {

  // Step 1 — Load configuration
  const config = await loadConfig(options);
  const log = createLogger(config.logger, config.logLevel);

  if (config.domains || config.shared) {
    log.warn('Infrastructure (domains/shared) is not yet supported in v1.2.x. These keys in configuration will be ignored until v2.0.0.');
  }

  log.info('Bootstrap started', {
    modules: pc.cyan(config.modules),
    prefix: pc.cyan(config.prefix || '(none)'),
    strict: pc.yellow(String(config.strict)),
    nodeVersion: pc.gray(process.version),
  });

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
    log.debug(`Discovered module directory: ${dirPath}`, { dirPath });
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
  // Using pureModuleAliases to separate user configured folders vs magically generated modules
  if (config.resolveAliases !== false) {
    const pureModuleAliases: Record<string, string> = {};
    
    // Automatically resolve @modules/<name> for each module
    for (const mod of resolvedModules) {
      const modName = path.basename(mod.dirPath);
      const aliasKey = `@modules/${modName}`;
      
      // Dual mapping for runtime consistency (N-09)
      pureModuleAliases[aliasKey] = mod.indexPath;
      pureModuleAliases[`${aliasKey}/*`] = `${mod.dirPath}/*`;
      
      registry.registerAlias(aliasKey, mod.indexPath);
      registry.registerAlias(`${aliasKey}/*`, `${mod.dirPath}/*`);
    }

    await activateAliasResolver(pureModuleAliases, config.aliases, log);
    updateAliasCache(registry.getAllAliases());
  }

  // Step 4 — Import modules
  for (const mod of resolvedModules) {
    const imported = await import(pathToFileURL(mod.indexPath).href);

    // Correlate the imported module with the one added to the registry based on dirPath
    const allRegistered = registry.getAllModules();
    const registeredMod = allRegistered.find(m => path.normalize(m.path) === path.normalize(mod.dirPath));

    if (!registeredMod) {
      throw new NodulusError(
        'MODULE_NOT_FOUND',
        `No index.ts found calling Module(). Add Module() to the module's index.ts.`,
        `File: ${mod.indexPath}`
      );
    }

    log.info(`Module loaded: ${pc.green(registeredMod.name)}`, {
      name: registeredMod.name,
      imports: registeredMod.imports,
      exports: registeredMod.exports,
      path: registeredMod.path,
    });

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
          log.warn(
            `Module "${registeredMod.name}" exports "${actual}" but it is not declared in Module() options "exports" array.`,
            { name: registeredMod.name, exportName: actual }
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

  // Step 6 — Discover controllers
  for (const mod of allModules) {
    const rawMod = registry.getRawModule(mod.name);
    if (!rawMod) continue; // Failsafe, should always exist

    const files = await fg('**/*.{ts,js,mts,mjs,cjs}', {
      cwd: mod.path,
      absolute: true,
      ignore: [
        '**/*.types.*',
        '**/*.d.ts',
        '**/*.spec.*',
        '**/*.test.*',
        'index.*' // Escapes root index.ts/js
      ]
    });

    files.sort();

    for (let file of files) {
      log.debug(`Scanning controller file: ${file}`, { filePath: file, module: mod.name });
      file = path.normalize(file);
      let imported: any;
      try {
        imported = await import(pathToFileURL(file).href);
      } catch (err: any) {
        throw new NodulusError(
          'INVALID_CONTROLLER',
          `Failed to import controller file. Check for syntax errors or missing dependencies.`,
          `File: ${file} — ${err.message}`
        );
      }

      const resolvedFile = path.normalize(file);
      const ctrlMeta = registry.getControllerMetadata(resolvedFile) || registry.getAllControllersMetadata().find(c => path.normalize(c.path) === resolvedFile);
      if (ctrlMeta) {
        // Evaluate router validity (must be default export & resemble an Express router)
        const isRouter = imported.default && typeof imported.default === 'function' && typeof imported.default.use === 'function';
        
        if (!isRouter) {
          throw new NodulusError(
            'INVALID_CONTROLLER',
            `Controller has no default export of a Router. Add export default router.`,
            `File: ${file}`
          );
        }

        log.debug(`Controller registered: ${pc.green(ctrlMeta.name)} → ${pc.cyan(ctrlMeta.prefix)}`, {
          name: ctrlMeta.name,
          prefix: ctrlMeta.prefix,
          module: mod.name,
          middlewareCount: ctrlMeta.middlewares.length,
        });

        // Bind the active Express Router instance directly to the internally saved metadata
        ctrlMeta.router = imported.default;
        rawMod.controllers.push(ctrlMeta);
      }
    }

    if (rawMod.controllers.length === 0) {
      log.warn(`Module "${mod.name}" has no controllers — no routes will be mounted from it`, {
        name: mod.name,
        path: mod.path,
      });
    }
  }

  // Step 7 — Mount routes
  const mountedRoutes: import('../types/index.js').MountedRoute[] = [];

  for (const mod of allModules) {
    const rawMod = registry.getRawModule(mod.name);
    if (!rawMod) continue;

    for (const ctrl of rawMod.controllers) {
      if (!ctrl.enabled) {
        log.info(`Controller "${ctrl.name}" is disabled — skipping mount`, {
          name: ctrl.name,
          module: mod.name,
          prefix: ctrl.prefix,
        });
        continue;
      }

      const fullPath = (config.prefix + ctrl.prefix).replace(/\/+/g, '/').replace(/\/$/, '') || '/';

      if (ctrl.router) {

        if (ctrl.middlewares && ctrl.middlewares.length > 0) {
           app.use(fullPath, ...ctrl.middlewares, ctrl.router);
        } else {
           app.use(fullPath, ctrl.router);
        }

        // Try to extract individual routes from Express router stack
        // If impossible, fallback to USE basepath.
        let foundRoutes = false;
        const extractedRoutes: { method: string, path: string }[] = [];

        if (ctrl.router.stack && Array.isArray(ctrl.router.stack)) {
          for (const layer of ctrl.router.stack) {
            const routeObj = layer.route as any;
            if (routeObj && routeObj.methods) {
              foundRoutes = true;
              const routePath = routeObj.path;
              const methods = Object.keys(routeObj.methods).filter(m => routeObj.methods[m]).map(m => m.toUpperCase());
              
              for (const method of methods) {
                const fullRoutePath = (fullPath + (routePath === '/' ? '' : routePath)).replace(/\/+/g, '/');
                extractedRoutes.push({ method, path: fullRoutePath });
                mountedRoutes.push({
                  method: method as any,
                  path: fullRoutePath,
                  module: mod.name,
                  controller: ctrl.name
                });
              }
            }
          }
        }

        if (!foundRoutes) {
          extractedRoutes.push({ method: 'USE', path: fullPath });
          mountedRoutes.push({
            method: 'USE',
            path: fullPath,
            module: mod.name,
            controller: ctrl.name
          });
        }

        const methodColors: Record<string, (msg: string) => string> = {
          GET: pc.green,
          POST: pc.yellow,
          PUT: pc.cyan,
          PATCH: pc.magenta,
          DELETE: pc.red,
          USE: pc.gray,
        };

        for (const route of extractedRoutes) {
          const colorFn = methodColors[route.method] || pc.white;
          log.info(`  ${colorFn(route.method.padEnd(6))} ${pc.white(route.path)}  ${pc.gray(`(${ctrl.name})`)}`, {
            method: route.method,
            path: route.path,
            module: mod.name,
            controller: ctrl.name,
          });
        }
      }
    }
  }

    // Tag Express app to prevent double boot
    (app as any).__nodulusBootstrapped = true;

    // Step 8 — Return NodulusApp
    const safeRegisteredModules = allModules.map(m => registry.getModule(m.name)!);
    
    const durationMs = Math.round(performance.now() - startTime);
    log.info(`${pc.green('Bootstrap complete')} — ${pc.cyan(allModules.length)} module(s), ${pc.cyan(mountedRoutes.length)} route(s) in ${pc.yellow(`${durationMs}ms`)}`, {
      moduleCount: allModules.length,
      routeCount: mountedRoutes.length,
      durationMs,
    });

    return {
      modules: safeRegisteredModules,
      routes: mountedRoutes,
      registry
    };

    } catch (err) {
      // Rollback: discard any partially registered state so a retry
      // does not encounter leftover modules or aliases.
      registry.clearRegistry();
      throw err;
    }
  });
}
