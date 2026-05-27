import type { ResolvedConfig, LogHandler } from '../types/index.js';
import { loadNodulusConfig } from '../config/nodulus-config.js';
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

export const loadConfig = async (
  options: { logger?: LogHandler } = {}
): Promise<BootConfig> => {
  const cwd = process.cwd();
  
  const fileConfig = await loadNodulusConfig(cwd, options.logger);

  return {
    ...fileConfig,
    modules:             fileConfig.modules             ?? DEFAULTS.modules,
    prefix:              fileConfig.prefix              ?? DEFAULTS.prefix,
    strict:              fileConfig.strict              ?? DEFAULTS.strict,
    resolveAliases:      fileConfig.resolveAliases      ?? DEFAULTS.resolveAliases,
    aliases:             fileConfig.aliases             ?? {},
    logger:              options.logger                 ?? defaultLogHandler,
    logLevel:            resolveLogLevel(fileConfig.logLevel),
    logFormat:           fileConfig.logFormat           ?? DEFAULTS.logFormat,
    nits: {
      enabled:             fileConfig.nits?.enabled             ?? DEFAULTS.nits.enabled,
      similarityThreshold: fileConfig.nits?.similarityThreshold ?? DEFAULTS.nits.similarityThreshold,
    },
    requirePreloader:    fileConfig.requirePreloader    ?? DEFAULTS.requirePreloader,
    moduleLoadTimeoutMs: fileConfig.moduleLoadTimeoutMs ?? DEFAULTS.moduleLoadTimeoutMs,
    resolvedAliases:     fileConfig.resolvedAliases     ?? new Map(),
  };
};
