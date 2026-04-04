import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CreateAppOptions, ResolvedConfig, NodulusConfig } from '../types/index.js';

const defaultStrict = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

export const DEFAULTS: ResolvedConfig = {
  modules: 'src/modules/*',
  prefix: '',
  aliases: {},
  strict: defaultStrict,
  resolveAliases: true,
  logger: (level, msg) => {
    if (level === 'warn' || level === 'error') {
      console[level](`[nodulus] ${msg}`);
    }
  },
};

export const loadConfig = async (options: CreateAppOptions = {}): Promise<ResolvedConfig> => {
  const cwd = process.cwd();
  
  let fileConfig: NodulusConfig = {};
  
  const tsPath = path.join(cwd, 'nodulus.config.ts');
  const jsPath = path.join(cwd, 'nodulus.config.js');
  
  // In production only .js is safe to import (no ts-node/tsx available).
  // In development, .ts is tried first so authors don't need a separate compile step.
  const candidates: string[] =
    process.env.NODE_ENV !== 'production'
      ? [tsPath, jsPath]
      : [jsPath];

  let configPathToLoad: string | null = null;

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      configPathToLoad = candidate;
      break;
    }
  }

  if (configPathToLoad) {
    try {
      // Dynamic import needs proper file URL on Windows
      const importUrl = pathToFileURL(configPathToLoad).href;
      const mod = await import(importUrl);
      
      // Handle both ES modules (default export) and CJS/bare exports
      fileConfig = mod.default || mod.config || mod;
    } catch (error: any) {
      throw new Error(`[Nodulus] Failed to parse or evaluate config file at ${configPathToLoad}: ${error.message}`);
    }
  }

  // Merge strategy: options > fileConfig > defaults
  return {
    modules: options.modules ?? fileConfig.modules ?? DEFAULTS.modules,
    prefix: options.prefix ?? fileConfig.prefix ?? DEFAULTS.prefix,
    aliases: {
      ...DEFAULTS.aliases,
      ...(fileConfig.aliases || {}),
      ...(options.aliases || {}) // Options override file aliases
    },
    strict: options.strict ?? fileConfig.strict ?? DEFAULTS.strict,
    resolveAliases: options.resolveAliases ?? fileConfig.resolveAliases ?? DEFAULTS.resolveAliases,
    logger: options.logger ?? fileConfig.logger ?? DEFAULTS.logger,
  };
};
