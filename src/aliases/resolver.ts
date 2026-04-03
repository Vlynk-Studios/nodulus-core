import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Node.js Customization Hooks types
export type ResolveHookContext = {
  conditions: string[];
  parentURL?: string;
  data?: any;
};

export type NextResolve = (specifier: string, context?: ResolveHookContext) => Promise<{ shortCircuit?: boolean; url: string }>;

export type ResolveHook = (
  specifier: string,
  context: ResolveHookContext,
  nextResolve: NextResolve
) => Promise<{ shortCircuit?: boolean; url: string }>;

let isHookRegistered = false;

/** @internal exclusively for tests */
export function clearAliasResolverOptions(): void {
  isHookRegistered = false;
}

/**
 * Activates the ESM Alias Resolver using Node.js module.register.
 * 
 * Limitation: This ESM hook is strictly for Node ESM pipelines (Node >= 20.6.0).
 * It will not function effectively in pure CJS pipelines without a transpiler or loader.
 * For CJS and bundlers (Vite, esbuild), use getAliases() to configure their specific resolvers.
 */
export function activateAliasResolver(moduleAliases: Record<string, string>, folderAliases: Record<string, string>): void {
  if (isHookRegistered) return;
  
  const combinedAliases = { ...folderAliases, ...moduleAliases };

  // Aliases are serialised directly into the hook source so they are available
  // in the hook's closure regardless of whether Node.js propagates context.data
  // across all resolution chains (not guaranteed in every Node 20.6+ build).
  const serialisedAliases = JSON.stringify(combinedAliases);

  const loaderCode = `
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const aliases = ${serialisedAliases};

export async function resolve(specifier, context, nextResolve) {
  for (const alias of Object.keys(aliases)) {
    if (specifier === alias || specifier.startsWith(alias + '/')) {
      const target = aliases[alias];
      const resolvedPath = specifier.replace(alias, target);
      return nextResolve(pathToFileURL(path.resolve(resolvedPath)).href, context);
    }
  }
  return nextResolve(specifier, context);
}
`;

  try {
    const dataUrl = `data:text/javascript,${encodeURIComponent(loaderCode)}`;
    const parentUrl = typeof __filename === 'undefined' ? import.meta.url : pathToFileURL(__filename).href;
    
    if (typeof register === 'function') {
      register(dataUrl, { parentURL: parentUrl });
      isHookRegistered = true;
    } else {
      console.warn('[Nodulus] Warning: node:module register() is not available. ESM aliases might not function properly in runtime. Please upgrade to Node.js >= 20.6.0');
    }
  } catch (err) {
    console.warn('[Nodulus] Warning: Failed to register ESM hook:', err);
  }
}
