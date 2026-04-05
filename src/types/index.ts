import type { RequestHandler, Router } from 'express';

// ─── Internal registry entries ────────────────────────────────────────────────
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
  name: string;
  path: string;       // absolute path to the module directory
  indexPath: string;  // absolute path to the module's index.ts / index.js
  imports: string[];
  exports: string[];
  controllers: ControllerEntry[];
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

export interface CreateAppOptions {
  /** Glob pointing to module folders. Default: 'src/modules/*'. */
  modules?: string;
  /** Global route prefix. Example: '/api/v1'. Default: ''. */
  prefix?: string;
  /** Folder aliases beyond the auto-generated @modules/* entries. Default: {}. */
  aliases?: Record<string, string>;
  /**
   * Enables circular dependency detection and undeclared import errors.
   * Default: true in development, false in production.
   */
  strict?: boolean;
  /**
   * If false, the runtime ESM alias hook is not activated.
   * Useful when the project resolves aliases via a bundler. Default: true.
   */
  resolveAliases?: boolean;
  /** Custom log handler. Default: console.warn for warnings, silent otherwise. */
  logger?: (level: 'info' | 'warn' | 'error', message: string) => void;
}

/** Resolved configuration used internally (defaults applied). */
export interface ResolvedConfig {
  modules: string;
  prefix: string;
  aliases: Record<string, string>;
  strict: boolean;
  resolveAliases: boolean;
  logger: (level: 'info' | 'warn' | 'error', message: string) => void;
}

/** A module as it appears in the NodularApp result after bootstrap. */
export interface RegisteredModule {
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

/** Value returned by createApp() after a successful bootstrap. */
export interface NodulusApp {
  modules: RegisteredModule[];
  routes: MountedRoute[];
  registry: NodulusRegistry;
}

/** Shape of nodulus.config.ts. Options passed directly to createApp() take priority. */
export interface NodulusConfig extends CreateAppOptions {}

export interface GetAliasesOptions {
  /** If false, only returns module aliases. Default: true. */
  includeFolders?: boolean;
  /** If true, returns absolute paths. Default: false. */
  absolute?: boolean;
}
