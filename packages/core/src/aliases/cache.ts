import { registryContext } from '../core/registry.js';

// Limitation: last write wins in parallel tests if not running within a registry context.
// When running within createApp(), the registry is the source of truth.
let globalAliasCache: Record<string, string> = {};

export function updateAliasCache(aliases: Record<string, string>): void {
  globalAliasCache = { ...aliases };
}

export function getAliasCache(): Record<string, string> {
  const activeRegistry = registryContext.getStore();
  if (activeRegistry) {
    return activeRegistry.getAllAliases();
  }
  return globalAliasCache;
}

export function clearAliasCache(): void {
  globalAliasCache = {};
}
