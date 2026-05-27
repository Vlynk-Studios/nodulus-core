import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CreateAppOptions, ResolvedConfig } from '../types/index.js';
import type { NodulusConfig } from '../config/nodulus-config.types.js';
import { loadNodulusConfig, type ResolvedNodulusConfig } from '../config/nodulus-config.js';
import { defaultLogHandler, resolveLogLevel } from './logger.js';

const defaultStrict = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

export const DEFAULTS: Omit<ResolvedConfig, 'aliases'> = {
  modules: 'src/modules/*',
  domains: undefined,
  shared: undefined,
  prefix: '',
  strict: defaultStrict,
  resolveAliases: true,
  logger: defaultLogHandler,
  logLevel: resolveLogLevel(),
  logFormat: 'auto',
  nits: {
    enabled: true,
    similarityThreshold: undefined, // Use dynamic by default
  },
  requirePreloader: false,
  moduleLoadTimeoutMs: 30_000
};

export type BootConfig = ResolvedConfig & { resolvedAliases: Map<string, string> };

export const loadConfig = async (options: CreateAppOptions & Partial<NodulusConfig> = {}): Promise<BootConfig> => {
  const cwd = process.cwd();
  
  const fileConfig = await loadNodulusConfig(cwd, options.logger);

  // Merge strategy: options > fileConfig > defaults
  return {
    ...fileConfig,
    modules: options.modules ?? fileConfig.modules ?? DEFAULTS.modules,
    domains: options.domains ?? fileConfig.domains ?? DEFAULTS.domains,
    shared: options.shared ?? fileConfig.shared ?? DEFAULTS.shared,
    prefix: options.prefix ?? fileConfig.prefix ?? DEFAULTS.prefix,
    strict: options.strict ?? fileConfig.strict ?? DEFAULTS.strict,
    resolveAliases: options.resolveAliases ?? fileConfig.resolveAliases ?? DEFAULTS.resolveAliases,
    aliases: fileConfig.aliases ?? {},
    logger: options.logger ?? DEFAULTS.logger,
    logLevel: resolveLogLevel(options.logLevel ?? fileConfig.logLevel),
    logFormat: options.logFormat ?? fileConfig.logFormat ?? DEFAULTS.logFormat,
    nits: {
      enabled: options.nits?.enabled ?? fileConfig.nits?.enabled ?? DEFAULTS.nits.enabled,
      similarityThreshold: options.nits?.similarityThreshold ?? fileConfig.nits?.similarityThreshold ?? DEFAULTS.nits.similarityThreshold,
    },
    requirePreloader: options.requirePreloader ?? fileConfig.requirePreloader ?? DEFAULTS.requirePreloader,
    moduleLoadTimeoutMs: options.moduleLoadTimeoutMs ?? fileConfig.moduleLoadTimeoutMs ?? DEFAULTS.moduleLoadTimeoutMs
  };
};
