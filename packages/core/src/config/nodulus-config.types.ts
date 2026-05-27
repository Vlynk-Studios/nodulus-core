import type { CreateAppOptions } from '../types/index.js';

export interface AliasMap {
  [alias: string]: string;
}

export interface NodulusConfig extends CreateAppOptions {
  aliases?: AliasMap;
}

export function defineConfig(config: NodulusConfig): NodulusConfig {
  return config;
}

export function isValidAliasKey(key: string): boolean {
  if (key === '@modules' || key === '@shared' || key === '@') return false;
  return /^@[a-zA-Z][a-zA-Z0-9-]*$/.test(key);
}

export const RESERVED_ALIASES = ['@modules', '@shared'] as const;
