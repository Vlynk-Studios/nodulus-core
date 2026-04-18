import path from 'node:path';
import { register } from 'node:module';
import type { Logger } from '../core/logger.js';

// Node.js Customization Hooks types
export type ResolveHookContext = {
  conditions: string[];
  parentURL?: string;
  data?: unknown;
};

export type NextResolve = (specifier: string, context?: ResolveHookContext) => Promise<{ shortCircuit?: boolean; url: string }>;

export type ResolveHook = (
  specifier: string,
  context: ResolveHookContext,
  nextResolve: NextResolve
) => Promise<{ shortCircuit?: boolean; url: string }>;

const registeredHashes = new Set<string>();
let registrationPromise: Promise<void> | null = null;

/** @internal exclusively for tests */
export function clearAliasResolverOptions(): void {
  registeredHashes.clear();
  registrationPromise = null;
}

/**
 * Activates the ESM Alias Resolver using Node.js module.register.
 * 
 * Limitation: This ESM hook is strictly for Node ESM pipelines (Node >= 20.6.0).
 * It will not function effectively in pure CJS pipelines without a transpiler or loader.
 * For CJS and bundlers (Vite, esbuild), use getAliases() to configure their specific resolvers.
 */
export async function activateAliasResolver(moduleAliases: Record<string, string>, folderAliases: Record<string, string>, log: Logger): Promise<void> {
  // Normalize paths before merging and hashing to ensure absolute paths are used in the loader
  const normalizedModuleAliases: Record<string, string> = {};
  for (const [alias, target] of Object.entries(moduleAliases)) {
    normalizedModuleAliases[alias] = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
  }

  const normalizedFolderAliases: Record<string, string> = {};
  for (const [alias, target] of Object.entries(folderAliases)) {
    normalizedFolderAliases[alias] = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
  }

  const combinedAliases = { ...normalizedModuleAliases, ...normalizedFolderAliases };
  const serialisedAliases = JSON.stringify(combinedAliases);

  if (registeredHashes.has(serialisedAliases)) return;

  // Optimistic registration to prevent race conditions
  registeredHashes.add(serialisedAliases);

  try {
    if (Object.keys(combinedAliases).length === 0) {
      log.debug('No aliases to register, skipping ESM hook activation');
      return;
    }

    for (const [alias, target] of Object.entries(normalizedFolderAliases)) {
      log.debug(`Alias registered: ${alias} → ${target}`, { alias, target, source: 'config' });
    }
    for (const [alias, target] of Object.entries(normalizedModuleAliases)) {
      log.debug(`Alias registered: ${alias} → ${target}`, { alias, target, source: 'module' });
    }

    const loaderCode = `
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const aliases = ${serialisedAliases};

export async function resolve(specifier, context, nextResolve) {
  for (const [alias, target] of Object.entries(aliases)) {
    if (alias.endsWith('/*')) {
      const baseAlias = alias.slice(0, -2);
      if (specifier === baseAlias || specifier.startsWith(baseAlias + '/')) {
        const baseTarget = target.slice(0, -2);
        const subPath = specifier.slice(baseAlias.length);
        const resolvedPath = path.resolve(baseTarget, subPath.startsWith('/') ? subPath.slice(1) : subPath);
        return nextResolve(pathToFileURL(resolvedPath).href, context);
      }
    } else if (specifier === alias) {
      return nextResolve(pathToFileURL(target).href, context);
    } else if (specifier.startsWith(alias + '/')) {
      const subPath = specifier.slice(alias.length + 1);
      const resolvedPath = path.resolve(target, subPath);
      return nextResolve(pathToFileURL(resolvedPath).href, context);
    }
  }
  return nextResolve(specifier, context);
}
`;

    const dataUrl = `data:text/javascript,${encodeURIComponent(loaderCode)}`;
    const parentUrl = import.meta.url;

    if (typeof register === 'function') {
      register(dataUrl, { parentURL: parentUrl });
      log.info(`ESM alias hook activated (${Object.keys(combinedAliases).length} alias(es))`, {
        aliasCount: Object.keys(combinedAliases).length,
      });
    } else {
      log.warn('ESM alias hook could not be registered — upgrade to Node.js >= 20.6.0 for runtime alias support', {
        nodeVersion: process.version
      });
      // If not supported, we should probably remove the hash so we can try again if the environment somehow changes (though unlikely)
      registeredHashes.delete(serialisedAliases);
    }
  } catch (err) {
    // If registration fails, remove the hash so it can be retried
    registeredHashes.delete(serialisedAliases);
    log.warn('ESM alias hook registration threw an unexpected error', {
      error: (err as any)?.message ?? String(err)
    });
  }
}
