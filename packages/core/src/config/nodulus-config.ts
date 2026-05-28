import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LogHandler } from '../types/index.js';
import {
  type NodulusConfig,
  type AliasMap,
  isValidAliasKey,
  RESERVED_ALIASES,
} from './nodulus-config.types.js';
import { NodulusError } from '../core/errors.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Internal config with all aliases resolved to absolute paths.
 * Produced by `loadNodulusConfig()` — consumed by the bootstrap pipeline.
 */
export interface ResolvedNodulusConfig extends NodulusConfig {
  /**
   * Aliases with their values resolved to absolute paths from `cwd`.
   * e.g. `@config` → `/abs/path/to/src/config`
   */
  resolvedAliases: Map<string, string>;
}

// ─── Config candidate search order ───────────────────────────────────────────

const CONFIG_CANDIDATES = [
  'nodulus.config.ts',
  'nodulus.config.js',
  'nodulus.config.mjs',
] as const;

// ─── Main loader ──────────────────────────────────────────────────────────────

/**
 * Loads and validates `nodulus.config.ts|js|mjs` from `cwd`.
 *
 * - If no config file is found, returns defaults with an empty alias map.
 * - Validates every alias key with `isValidAliasKey()` → throws `INVALID_ALIAS_KEY`.
 * - Rejects reserved aliases (`@modules`, `@shared`) → throws `ALIAS_RESERVED`.
 * - Emits a `warn` log for aliases whose target path does not exist on disk.
 */
export async function loadNodulusConfig(
  cwd: string,
  log?: LogHandler,
): Promise<ResolvedNodulusConfig> {
  const logger = log ?? (() => { /* noop */ });

  // ── 1. Locate config file ──────────────────────────────────────────────────
  let configPath: string | null = null;

  for (const candidate of CONFIG_CANDIDATES) {
    const full = path.join(cwd, candidate);
    if (fs.existsSync(full)) {
      configPath = full;
      break;
    }
  }

  // ── 2. Load or use empty defaults ─────────────────────────────────────────
  let fileConfig: NodulusConfig = {};

  if (!configPath) {
    logger('debug', '[config] No nodulus.config found, using defaults', { _module: 'config' });
  } else {
    try {
      const importUrl = pathToFileURL(configPath).href;
      const mod = await import(importUrl);
      fileConfig = mod.default ?? mod.config ?? mod;
    } catch (error: any) {
      if (configPath.endsWith('.ts') && error.code === 'ERR_UNKNOWN_FILE_EXTENSION') {
        throw new Error(
          `[System] Found "${path.basename(configPath)}" but your environment cannot load raw TypeScript files.\n` +
          `  - In production: Run "npm run build" OR use nodulus.config.js.\n` +
          `  - In development: Ensure you are running with a loader like "tsx" or "ts-node".`,
          { cause: error },
        );
      }
      throw new Error(
        `[System] Failed to parse config at "${configPath}": ${error.message}`,
        { cause: error },
      );
    }
  }

  // ── 2.5 Validations ────────────────────────────────────────────────────────
  if (fileConfig.moduleLoadTimeoutMs !== undefined) {
    if (typeof fileConfig.moduleLoadTimeoutMs !== 'number' || fileConfig.moduleLoadTimeoutMs <= 0) {
      logger('warn', `[nodulus] moduleLoadTimeoutMs must be a positive number. Using default: 30000ms.`, { _module: 'config' });
      fileConfig.moduleLoadTimeoutMs = 30000;
    }
  }

  if (fileConfig.logLevel !== undefined) {
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(fileConfig.logLevel)) {
      logger('warn', `[nodulus] Invalid logLevel: "${fileConfig.logLevel}". Using 'info'.`, { _module: 'config' });
      fileConfig.logLevel = 'info';
    }
  }

  if (fileConfig.logFormat !== undefined) {
    const validFormats = ['json', 'pretty', 'auto'];
    if (!validFormats.includes(fileConfig.logFormat)) {
      logger('warn', `[nodulus] Invalid logFormat: "${fileConfig.logFormat}". Using 'auto'.`, { _module: 'config' });
      fileConfig.logFormat = 'auto';
    }
  }

  // ── 3. Validate and resolve aliases ───────────────────────────────────────
  const rawAliases: AliasMap = fileConfig.aliases ?? {};
  const resolvedAliases = new Map<string, string>();

  for (const [key, value] of Object.entries(rawAliases)) {
    // 3a. Reserved alias check (takes priority over format validation)
    if ((RESERVED_ALIASES as readonly string[]).includes(key)) {
      throw new NodulusError(
        'ALIAS_RESERVED',
        `[nodulus] The alias "${key}" is reserved by Nodulus and cannot be redefined in nodulus.config.ts.`,
        key,
      );
    }

    // 3b. Key format validation
    if (!isValidAliasKey(key)) {
      throw new NodulusError(
        'INVALID_ALIAS_KEY',
        `[nodulus] The alias "${key}" is not a valid key. ` +
        `Keys must start with "@" followed by at least one letter (e.g. "@config", "@db"). ` +
        `Invalid alias detected in nodulus.config.`,
        key,
      );
    }

    // 3c. Existence check (warn, don't throw)
    const absolutePath = path.resolve(cwd, value);
    if (!fs.existsSync(absolutePath)) {
      logger('warn', `[nodulus] The alias "${key}" points to "${value}" but that path does not exist.`, {
        _module: 'config',
        alias: key,
        target: value,
        resolved: absolutePath,
      });
    }

    resolvedAliases.set(key, absolutePath);
  }

  return {
    ...fileConfig,
    resolvedAliases,
  };
}
