import * as fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import type { LogHandler } from '../../types/index.js';
import type { NodulusConfig } from '../../config/nodulus-config.types.js';
import type { NodulusRegistry } from '../../types/index.js';
import { normalizePath } from '../../core/utils/paths.js';

export interface ImportFound {
  specifier: string;
  line: number;
  file: string;
}

const IMPORT_REGEX =
  /(?:import|export)(?:\s+type\s+)?(?:\s+|\s*\()(?:[^"';]+\s+from\s+)?['"]([^"';]+)['"]/g;

const RELATIVE_IMPORT_REGEX =
  /(?:import|export)(?:\s+type\s+)?(?:\s+|\s*\()(?:[^"';]+\s+from\s+)?['"](\.\.?\/[^"';]+)['"]/g;

const DEFAULT_ACTIVE_ALIASES = ['@modules'] as const;

function emitLog(log: LogHandler | undefined, level: 'warn' | 'debug', message: string): void {
  if (log) {
    log(level, message, { _module: 'import-scanner' });
    return;
  }
  if (level === 'warn') {
    console.warn(message);
  } else {
    console.debug(message);
  }
}

/**
 * Returns bare alias keys registered in the runtime (excludes `/*` wildcard entries).
 * Falls back to `@modules` when the registry has no aliases yet.
 */
export function getRegisteredAliases(registry: NodulusRegistry): string[] {
  const keys = Object.keys(registry.getAllAliases()).filter(k => !k.endsWith('/*'));
  return keys.length > 0 ? keys : [...DEFAULT_ACTIVE_ALIASES];
}

/**
 * Builds the active-alias list for static analysis (CLI `check`) from config + discovered modules.
 * `@modules` covers every `@modules/<name>` subpath via prefix matching (REGLA-22).
 */
export function buildActiveAliasesFromConfig(
  config: NodulusConfig,
  _moduleNames: string[] = [],
): string[] {
  const aliases = new Set<string>(['@modules']);
  if (config.aliases) {
    for (const key of Object.keys(config.aliases)) {
      aliases.add(key);
    }
  }
  return [...aliases];
}

function isNodulusAlias(specifier: string, activeAliases: readonly string[]): boolean {
  if (!specifier.startsWith('@')) {
    return false;
  }
  return activeAliases.some(
    alias => specifier === alias || specifier.startsWith(`${alias}/`),
  );
}

function parseImportSpecifiers(
  filePath: string,
  log?: LogHandler,
): { specifier: string; line: number }[] | null {
  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    const isJs =
      filePath.endsWith('.js') ||
      filePath.endsWith('.mjs') ||
      filePath.endsWith('.cjs');

    if (isJs) {
      try {
        acorn.parse(code, {
          ecmaVersion: 'latest',
          sourceType: 'module',
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        emitLog(log, 'warn', `[System] [NITS Parser] Warning: Failed to parse imports in "${filePath}".`);
        emitLog(log, 'debug', `  Detail: ${message}`);
        return null;
      }
    }

    const results: { specifier: string; line: number }[] = [];
    let match: RegExpExecArray | null;
    const regex = new RegExp(IMPORT_REGEX.source, IMPORT_REGEX.flags);

    while ((match = regex.exec(code)) !== null) {
      const specifier = match[1];
      const textBeforeMatch = code.substring(0, match.index);
      const line = textBeforeMatch.split('\n').length;
      results.push({ specifier, line });
    }

    return results;
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return null;
    }
    const message = err instanceof Error ? err.message : String(err);
    emitLog(log, 'warn', `[System] [NITS Parser] Warning: Failed to parse imports in "${filePath}".`);
    emitLog(log, 'debug', `  Detail: ${message}`);
    return null;
  }
}

/**
 * REGLA-22: only include imports that match active Nodulus aliases (inclusion list).
 * Relative cross-module imports are handled by `extractRelativeCrossModuleImports`.
 */
export function extractModuleImports(
  filePath: string,
  activeAliases: readonly string[] = DEFAULT_ACTIVE_ALIASES,
  log?: LogHandler,
): ImportFound[] {
  const parsed = parseImportSpecifiers(filePath, log);
  if (!parsed) return [];

  const imports: ImportFound[] = [];
  for (const { specifier, line } of parsed) {
    if (!isNodulusAlias(specifier, activeAliases)) continue;
    imports.push({ specifier, line, file: filePath });
  }
  return imports;
}

/**
 * Scans a file for relative imports whose resolved target lies outside `moduleDirPath`.
 * Never throws — resolution errors yield an empty array and a debug log.
 */
export interface RelativeCrossModuleImport {
  specifier: string;
  line: number;
}

export function extractRelativeCrossModuleImports(
  filePath: string,
  moduleDirPath: string,
  log?: LogHandler,
): RelativeCrossModuleImport[] {
  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    const moduleRoot = normalizePath(moduleDirPath);
    const fileDir = path.dirname(filePath);
    const crossModule: RelativeCrossModuleImport[] = [];

    let match: RegExpExecArray | null;
    const regex = new RegExp(RELATIVE_IMPORT_REGEX.source, RELATIVE_IMPORT_REGEX.flags);

    while ((match = regex.exec(code)) !== null) {
      const specifier = match[1];
      const textBeforeMatch = code.substring(0, match.index);
      const line = textBeforeMatch.split('\n').length;
      try {
        const resolvedPath = normalizePath(path.resolve(fileDir, specifier));
        const isInside =
          resolvedPath === moduleRoot || resolvedPath.startsWith(`${moduleRoot}/`);

        if (!isInside) {
          crossModule.push({ specifier, line });
        }
      } catch (resolveErr: unknown) {
        const message = resolveErr instanceof Error ? resolveErr.message : String(resolveErr);
        log?.('debug', `[import-scanner] Could not resolve "${specifier}" in "${filePath}": ${message}`, {
          _module: 'import-scanner',
          file: filePath,
          specifier,
        });
      }
    }

    return crossModule;
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return [];
    }
    const message = err instanceof Error ? err.message : String(err);
    log?.('debug', `[import-scanner] Failed to scan relative imports in "${filePath}": ${message}`, {
      _module: 'import-scanner',
      file: filePath,
    });
    return [];
  }
}
