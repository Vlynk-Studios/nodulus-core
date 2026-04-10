// Limitation: last write wins in parallel tests.
// Do not use getAliasCache() in concurrent tests that rely on different aliases.
let aliasCache: Record<string, string> = {};

export function updateAliasCache(aliases: Record<string, string>): void {
  aliasCache = { ...aliases };
}

export function getAliasCache(): Record<string, string> {
  return aliasCache;
}

export function clearAliasCache(): void {
  aliasCache = {};
}
