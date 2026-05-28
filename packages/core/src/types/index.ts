import type { RequestHandler, ErrorRequestHandler, Router } from 'express';

// ─── Internal registry entries ───────────────────────────────────────────────
// These types are NOT part of the public API. They represent the shape of data
// stored in the registry during bootstrap.

export interface ControllerEntry {
  name: string;
  path: string;
  prefix: string;
  middlewares: RequestHandler[];
  router?: Router;
  enabled: boolean;
}

export interface ModuleEntry {
  nitsId: string;     // NITS specific assigned ID
  name: string;
  path: string;       // absolute path to the module directory
  indexPath: string;  // absolute path to the module's index.ts / index.js
  imports: string[];
  exports: string[];
  controllers: ControllerEntry[];
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Function that receives a log event from Nodulus.
 * 
 * @param level   - Severity level.
 * @param message - Human-readable message.
 * @param meta    - Optional structured data for machine consumption.
 */
export type LogHandler = (
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
) => void;

/**
 * Public logger interface.
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message:  string, meta?: Record<string, unknown>): void;
  warn(message:  string, meta?: Record<string, unknown>): void;
  /**
   * Logs an error message.
   * If `meta.err` or `meta.error` is an Error instance, it is automatically serialized with its stack trace in JSON output.
   */
  error(message: string, meta?: Record<string, unknown> & { err?: Error, error?: Error }): void;
}

/**
 * Configuration options for the HTTP logger middleware.
 */
export interface HttpLoggerOptions {
  /** 
   * Routes to ignore (no logs will be emitted for these paths).
   * Supports exact strings (e.g., `'/health'`) and simple prefix globs (e.g., `'/api/v1/status*'`).
   * @default []
   */
  ignore?: string[];
  
  /** 
   * Whether to log the request body. Note that the logger must be set to 'debug' level
   * for the body to actually be printed/recorded.
   * @default false 
   */
  logBody?: boolean;
}

/**
 * A logger middleware generator for Express applications.
 * Provides separate middlewares for incoming requests and unhandled errors.
 */
export interface HttpLogger {
  /** 
   * Access log middleware that logs request execution time and status.
   * Typically mounted early in the Express pipeline.
   * Output format: `METHOD /path STATUS Xms`
   */
  requests(): RequestHandler;
  
  /** 
   * Error handler middleware that logs unhandled exceptions.
   * Must be mounted at the very end of the Express pipeline.
   */
  errors(): ErrorRequestHandler;
}

// ─── Public API types ─────────────────────────────────────────────────────────
// Exported as part of the public surface. Stable between minor versions unless
// documented otherwise.

export interface ModuleOptions {
  /** Modules this module depends on. */
  imports?: string[];
  /**
   * Names of exports that form the public API of this module.
   * Nodulus validates that each name exists as a real export of index.ts.
   * Error EXPORT_MISMATCH if a name is missing.
   */
  exports?: string[];
  /** Description — for documentation and future tooling. */
  description?: string;
}

export interface ControllerOptions {
  /** Middlewares applied to all routes. Mounted before the router. Default: []. */
  middlewares?: RequestHandler[];
  /** If false, createApp() ignores this controller entirely. Default: true. */
  enabled?: boolean;
}

export interface ServiceOptions {
  /** The module this service belongs to. If omitted, inferred from the file's parent folder name. */
  module?: string;
  /** Description — for documentation and future tooling. */
  description?: string;
}

export interface RepositoryOptions {
  /** The module this repository belongs to. If omitted, inferred from the file's parent folder name. */
  module?: string;
  /** Description — for documentation and future tooling. */
  description?: string;
  /** Data source type this repository talks to. */
  source?: 'database' | 'api' | 'cache' | 'file' | string;
}

/** Internal registry entry for a registered service. */
export interface ServiceEntry {
  name: string;
  path: string;
  type: 'service';
  module: string;
  description?: string;
}

/** Internal registry entry for a registered repository. */
export interface RepositoryEntry {
  name: string;
  path: string;
  type: 'repository';
  module: string;
  description?: string;
  source?: string;
}

export interface SchemaOptions {
  /** The module this schema belongs to. If omitted, inferred from the file's parent folder name. */
  module?: string;
  /** Description — for documentation and future tooling. */
  description?: string;
  /** Validation library used to define this schema. */
  library?: 'zod' | 'joi' | 'yup' | 'ajv' | string;
}

/** Internal registry entry for a registered schema. */
export interface SchemaEntry {
  name: string;
  path: string;
  type: 'schema';
  module: string;
  description?: string;
  library?: string;
}

/** Discriminated union for all file-level identifier entries. */
export type FileEntry = ServiceEntry | RepositoryEntry | SchemaEntry;

export interface NitsConfig {
  /** 
   * Custom similarity threshold (0.0 to 1.0). 
   * If omitted, a dynamic threshold based on module size is used.
   */
  similarityThreshold?: number;
  /** Whether to enable NITS identity tracking. Default: true. */
  enabled?: boolean;
}

export type LogFormat = 'pretty' | 'json' | 'auto';

/**
 * Options accepted by {@link createApp}.
 *
 * @since v1.0.0
 *
 * ## Breaking change — v1.8.0
 * All declarative configuration (modules, prefix, strict, aliases, logLevel,
 * logFormat, resolveAliases, requirePreloader, moduleLoadTimeoutMs, nits, etc.)
 * has been **removed** from this interface and must now be declared in
 * `nodulus.config.ts` via `defineConfig()`.
 *
 * `onShutdown` was moved to {@link ListenOptions} (passed to `nodulus.listen()`).
 *
 * The only option that remains here is `logger`, because it is a runtime
 * artifact (a function reference) that cannot be serialised in a config file.
 */
export interface CreateAppOptions {
  /**
   * Custom log handler. If omitted, Nodulus uses the default pino instance
   * configured via `logLevel` and `logFormat` in `nodulus.config.ts`.
   */
  logger?: LogHandler;
}

/** Resolved configuration used internally (defaults applied). */
export interface ResolvedConfig {
  modules: string;
  domains?: string;
  shared?: string;
  prefix: string;
  strict: boolean;
  resolveAliases: boolean;
  aliases: Record<string, string>;
  logger: LogHandler;
  logLevel: LogLevel;
  logFormat: LogFormat;
  nits: {
    enabled: boolean;
    similarityThreshold?: number;
  };
  requirePreloader: boolean;
  moduleLoadTimeoutMs: number;
}

/** A module as it appears in the NodularApp result after bootstrap. */
export interface RegisteredModule {
  id: string;
  name: string;
  path: string;         // absolute path to the module directory
  imports: string[];    // names of modules this module depends on
  exports: string[];    // declared and validated export names
  controllers: string[]; // names of mounted controllers
}

export interface MountedRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'USE';
  path: string;
  module: string;
  controller: string;
}

/** Stable registry interface — guaranteed across minor versions. */
export interface NodulusRegistry {
  hasModule(name: string): boolean;
  getModule(name: string): RegisteredModule | undefined;
  getAllModules(): RegisteredModule[];
  resolveAlias(alias: string): string | undefined;
  getAllAliases(): Record<string, string>;
  /** Bare alias keys (no `/*` wildcards) used for import scanning (REGLA-22). */
  getRegisteredAliases(): string[];
}

/**
 * Advanced registry interface — exposes internal graph utilities.
 * @unstable May change between minor versions.
 */
export interface NodulusRegistryAdvanced extends NodulusRegistry {
  /** @unstable */
  getDependencyGraph(): Map<string, string[]>;
  /** @unstable */
  findCircularDependencies(): string[][];
}

export interface ShutdownHook {
  (): Promise<void>;
  unregister: () => void;
}

/** Value returned by createApp() after a successful bootstrap. */
export interface ListenOptions {
  /**
   * Async hook executed during graceful shutdown, after the HTTP server closes.
   * Previously passed to createApp() — moved here in v1.8.0.
   */
  onShutdown?: () => void | Promise<void>;
}

export interface NodulusApp {
  modules: RegisteredModule[];
  routes: MountedRoute[];
  registry: NodulusRegistry;
  /**
   * Runtime metadata about the Nodulus pre-loader.
   * Populated during Step 0 of the bootstrap pipeline.
   * @since v1.5.0
   */
  runtime: {
    /**
     * `true` when the process was started with `--import ./.nodulus/preload.js`,
     * meaning top-level alias resolution is available.
     */
    preloaderActive: boolean;
    /**
     * The version of `nodulus-core` that generated `.nodulus/preload.js`,
     * or `null` if the pre-loader is not active.
     */
    preloaderVersion: string | null;
    /**
     * Snapshot of all aliases that were active at bootstrap time.
     * Empty object when the pre-loader is not active.
     */
    aliasesAtBoot: Record<string, string>;
  };
  /**
   * Registers the HTTP server instance with the Nodulus shutdown manager.
   * Once called, SIGINT (Ctrl+C) and SIGTERM signals will trigger a graceful
   * shutdown sequence:
   *   1. Close the HTTP server (no new connections accepted).
   *   2. Run the `onShutdown` hook from {@link ListenOptions} (if provided).
   *   3. Exit with code 0.
   *
   * Also returns a `shutdown()` function you can call programmatically.
   *
   * @param server  - The http.Server returned by app.listen().
   * @param options - Optional shutdown hook and configuration.
   * @returns A function that triggers the shutdown sequence manually.
   *
   * @example
   * ```ts
   * const server = app.listen(3000);
   * nodulus.listen(server, { onShutdown: async () => { await db.close(); } });
   * ```
   * @since v1.5.1
   */
  listen(server: import('node:http').Server, options?: ListenOptions): ShutdownHook;
}

export interface GetAliasesOptions {
  /**
   * If false, only returns auto-generated @modules/* aliases.
   * Config-defined aliases (from nodulus.config.ts `aliases`) are excluded.
   * Default: true (returns all aliases).
   */
  includeFolders?: boolean;
  /**
   * If false, config-defined aliases are excluded.
   * Identical to `includeFolders` but with a more descriptive name.
   * If both are present, `includeConfigAliases` takes precedence.
   * Default: true.
   */
  includeConfigAliases?: boolean;
  /** If true, returns absolute paths. Default: false. */
  absolute?: boolean;
}

export interface WatcherOptions {
  /** Paths or globs to watch. Accepts string or array of strings. */
  paths: string | string[];
  /** Globs or functions to ignore. Ignores node_modules and .git by default. */
  ignored?: string | string[] | ((path: string) => boolean);
  /** Debounce in ms before restarting. Default: 300 */
  debounceMs?: number;
  /** Callback to execute when a change is detected. Receives the path of the modified file. */
  onRestart: (changedPath: string) => void | Promise<void>;
  /** Nodulus logger instance. */
  logger: Logger; // reference to the existing internal Logger
}

/** Structured error codes thrown by Nodulus (includes CLI / check violations). */
export type { NodulusErrorCode } from '../core/errors.js';
