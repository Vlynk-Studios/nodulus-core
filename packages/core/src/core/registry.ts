import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { NodulusError } from './errors.js';
import { findCircularDependencies } from './utils/cycle-detector.js';
import { normalizePath } from './utils/paths.js';
import type { 
  ModuleEntry, 
  RegisteredModule, 
  NodulusRegistryAdvanced,
  ModuleOptions,
  ControllerEntry,
  ServiceEntry,
  RepositoryEntry,
  SchemaEntry,
  FileEntry
} from '../types/index.js';

export type ModuleRegistration = RegisteredModule;
export type FeatureRegistration = FileEntry;

const toRegisteredModule = (entry: ModuleEntry): RegisteredModule => ({
  id: entry.id,
  name: entry.name,
  path: entry.path,
  imports: entry.imports,
  exports: entry.exports,
  controllers: entry.controllers.map(c => c.name)
});

/** 
 * Extended interface for internal use (includes mutators)
 * @internal
 */
export interface InternalRegistry extends NodulusRegistryAdvanced {
  /** Seeds the registry with pre-calculated NITS IDs for specific directory paths */
  seedNitsIds(mapping: Map<string, string>): void;
  /** Retrieves a seeded NITS ID for a given absolute directory path */
  getNitsIdForPath(dirPath: string): string | undefined;
  /** Registers a module and throws DUPLICATE_MODULE if the nitsId already exists */
  registerModule(name: string, options: ModuleOptions, dirPath: string, indexPath: string, nitsId: string): void;
  /** Adds an alias to the registry */
  registerAlias(alias: string, path: string): void;
  /** Stores temporary metadata for a recently evaluated controller */
  registerControllerMetadata(entry: ControllerEntry): void;
  /** Returns metadata for all controllers (useful for tests and bootstrap) */
  getAllControllersMetadata(): ControllerEntry[];
  /** Returns metadata for a single controller filtered by its filepath */
  getControllerMetadata(filePath: string): ControllerEntry | undefined;
  /** Gets the raw module entry (with router, middlewares, etc.) */
  getRawModule(name: string): ModuleEntry | undefined;
  /** Registers a file-level identifier (Service, Repository, etc.) in the registry */
  registerFileMetadata(entry: FileEntry): void;
  /** Returns all registered service entries */
  getAllServices(): ServiceEntry[];
  /** Returns a single service entry by name */
  getService(name: string): ServiceEntry | undefined;
  /** Returns all registered repository entries */
  getAllRepositories(): RepositoryEntry[];
  /** Returns a single repository entry by name */
  getRepository(name: string): RepositoryEntry | undefined;
  /** Returns all registered schema entries */
  getAllSchemas(): SchemaEntry[];
  /** Returns a single schema entry by name */
  getSchema(name: string): SchemaEntry | undefined;
  /**
   * @internal for tests only
   */
  clearRegistry(): void;
}

/**
 * Creates a new independent registry instance.
 * @internal
 */
export function createRegistry(): InternalRegistry {
  const modules = new Map<string, ModuleEntry>();      // key: nitsId
  const modulesByName = new Map<string, string>();     // key: name -> nitsId
  const modulesByPath = new Map<string, string>();     // key: path -> nitsId
  const seededNitsIds = new Map<string, string>();     // key: absolute path -> nitsId

  const aliases = new Map<string, string>();
  const controllers = new Map<string, ControllerEntry>();
  const services = new Map<string, ServiceEntry>();
  const repositories = new Map<string, RepositoryEntry>();
  const schemas = new Map<string, SchemaEntry>();

  return {
    hasModule(name: string): boolean {
      return modulesByName.has(name);
    },

    getModule(name: string): RegisteredModule | undefined {
      const id = modulesByName.get(name);
      if (!id) return undefined;
      const entry = modules.get(id);
      return entry ? toRegisteredModule(entry) : undefined;
    },

    getAllModules(): RegisteredModule[] {
      return Array.from(modules.values()).map(toRegisteredModule);
    },

    resolveAlias(alias: string): string | undefined {
      return aliases.get(alias);
    },

    getAllAliases(): Record<string, string> {
      return Object.fromEntries(aliases.entries());
    },

    getDependencyGraph(): Map<string, string[]> {
      const graph = new Map<string, string[]>();
      for (const entry of modules.values()) {
        graph.set(entry.name, entry.imports);
      }
      return graph;
    },

    findCircularDependencies(): string[][] {
      const dependencyMap = new Map<string, string[]>();
      for (const entry of modules.values()) {
        dependencyMap.set(entry.name, entry.imports);
      }
      return findCircularDependencies(dependencyMap);
    },

    seedNitsIds(mapping: Map<string, string>): void {
      for (const [dirPath, id] of mapping.entries()) {
        seededNitsIds.set(normalizePath(dirPath), id);
      }
    },

    getNitsIdForPath(dirPath: string): string | undefined {
      return seededNitsIds.get(normalizePath(dirPath));
    },

    registerModule(name: string, options: ModuleOptions, dirPath: string, indexPath: string, nitsId: string): void {
      if (modules.has(nitsId)) {
        throw new NodulusError(
          'DUPLICATE_MODULE',
          `A module with this NITS ID already exists. Identity must be unique.`,
          `NITS ID: ${nitsId}, Name: ${name}, Path: ${dirPath}`
        );
      }
      
      const normalizedPath = normalizePath(dirPath);

      if (modulesByPath.has(normalizedPath)) {
        const existingId = modulesByPath.get(normalizedPath)!;
        const existing = modules.get(existingId);
        throw new NodulusError(
          'DUPLICATE_MODULE',
          `A module is already registered for this folder. Call Module() only once per directory.`,
          `Existing: ${existing?.name}, New: ${name}, Folder: ${dirPath}`
        );
      }
      
      const entry: ModuleEntry = {
        id: nitsId,
        name,
        path: dirPath,
        indexPath,
        imports: options.imports || [],
        exports: options.exports || [],
        controllers: []
      };
      
      modules.set(nitsId, entry);
      modulesByName.set(name, nitsId);
      modulesByPath.set(normalizedPath, nitsId);
    },

    registerAlias(alias: string, targetPath: string): void {
      const existing = aliases.get(alias);
      if (existing && existing !== targetPath) {
        throw new NodulusError(
          'DUPLICATE_ALIAS',
          `An alias with this name is already registered to a different target path.`,
          `Alias: ${alias}, Existing: ${existing}, New: ${targetPath}`
        );
      }
      aliases.set(alias, targetPath);
    },

    registerControllerMetadata(entry: ControllerEntry): void {
      const normalizedPath = normalizePath(entry.path);
      if (controllers.has(normalizedPath)) {
        throw new NodulusError(
          'INVALID_CONTROLLER',
          `Controller() was called more than once in the same file.`,
          `File: ${entry.path}`
        );
      }
      controllers.set(normalizedPath, entry);
    },

    getControllerMetadata(filePath: string): ControllerEntry | undefined {
      return controllers.get(normalizePath(filePath));
    },

    getAllControllersMetadata(): ControllerEntry[] {
      return Array.from(controllers.values());
    },

    getRawModule(name: string): ModuleEntry | undefined {
      const id = modulesByName.get(name);
      return id ? modules.get(id) : undefined;
    },

    registerFileMetadata(entry: FileEntry): void {
      if (entry.type === 'service') {
        if (services.has(entry.name)) {
          throw new NodulusError(
            'DUPLICATE_SERVICE',
            `A service named "${entry.name}" is already registered. Each Service() name must be unique within the registry.`,
            `Duplicate name: ${entry.name}`
          );
        }
        services.set(entry.name, entry);
      } else if (entry.type === 'repository') {
        if (repositories.has(entry.name)) {
          throw new NodulusError(
            'DUPLICATE_REPOSITORY',
            `A repository named "${entry.name}" is already registered. Each Repository() name must be unique within the registry.`,
            `Duplicate name: ${entry.name}`
          );
        }
        repositories.set(entry.name, entry);
      } else if (entry.type === 'schema') {
        if (schemas.has(entry.name)) {
          throw new NodulusError(
            'DUPLICATE_SCHEMA',
            `A schema named "${entry.name}" is already registered. Each Schema() name must be unique within the registry.`,
            `Duplicate name: ${entry.name}`
          );
        }
        schemas.set(entry.name, entry);
      }
    },

    getAllServices(): ServiceEntry[] {
      return Array.from(services.values());
    },

    getService(name: string): ServiceEntry | undefined {
      return services.get(name);
    },

    getAllRepositories(): RepositoryEntry[] {
      return Array.from(repositories.values());
    },

    getRepository(name: string): RepositoryEntry | undefined {
      return repositories.get(name);
    },

    getAllSchemas(): SchemaEntry[] {
      return Array.from(schemas.values());
    },

    getSchema(name: string): SchemaEntry | undefined {
      return schemas.get(name);
    },

    clearRegistry(): void {
      modules.clear();
      modulesByName.clear();
      modulesByPath.clear();
      seededNitsIds.clear();
      aliases.clear();
      controllers.clear();
      services.clear();
      repositories.clear();
      schemas.clear();
    }
  };
}

export const registryContext = new AsyncLocalStorage<InternalRegistry>();

export function getActiveRegistry(): InternalRegistry {
  const store = registryContext.getStore();
  if (!store) {
    throw new NodulusError(
      'REGISTRY_MISSING_CONTEXT',
      'No active registry found in the current async context. Ensure code runs inside a createApp() execution scope.'
    );
  }
  return store;
}

export const getRegistry = (): NodulusRegistryAdvanced => getActiveRegistry();
