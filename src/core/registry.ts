import { AsyncLocalStorage } from 'node:async_hooks';
import { NodulusError } from './errors.js';
import type { 
  ModuleEntry, 
  RegisteredModule, 
  NodulusRegistryAdvanced,
  ModuleOptions,
  ControllerEntry
} from '../types/index.js';

const toRegisteredModule = (entry: ModuleEntry): RegisteredModule => ({
  name: entry.name,
  path: entry.path,
  imports: entry.imports,
  exports: entry.exports,
  controllers: entry.controllers.map(c => c.name)
});

// Extended interface for internal use (includes mutators)
export interface InternalRegistry extends NodulusRegistryAdvanced {
  /** Registers an internal module and throws DUPLICATE_MODULE if it already exists */
  registerModule(name: string, options: ModuleOptions, dirPath: string, indexPath: string): void;
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
  /**
   * @internal for tests only
   */
  clearRegistry(): void;
}

/**
 * Creates a new independent registry instance.
 * Mainly used to build the singleton, but can be instantiated separately if needed.
 */
export function createRegistry(): InternalRegistry {
  const modules = new Map<string, ModuleEntry>();
  const aliases = new Map<string, string>();
  const controllers = new Map<string, ControllerEntry>();

  return {
    hasModule(name: string): boolean {
      return modules.has(name);
    },

  getModule(name: string): RegisteredModule | undefined {
    const entry = modules.get(name);
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
    for (const [name, entry] of modules.entries()) {
      graph.set(name, entry.imports);
    }
    return graph;
  },

  findCircularDependencies(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string) => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const deps = modules.get(node)?.imports || [];
      for (const neighbor of deps) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recStack.has(neighbor)) {
          // We hit a node currently in the stack (cycle detected)
          const cycleStart = path.indexOf(neighbor);
          cycles.push([...path.slice(cycleStart), neighbor]);
        }
      }

      recStack.delete(node);
      path.pop();
    };

    for (const node of modules.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  },

  registerModule(name: string, options: ModuleOptions, dirPath: string, indexPath: string): void {
    if (modules.has(name)) {
      throw new NodulusError(
        'DUPLICATE_MODULE',
        `A module with this name already exists. Each module must have a unique name.`,
        `Module name: ${name}`
      );
    }
    
    const entry: ModuleEntry = {
      name,
      path: dirPath,
      indexPath,
      imports: options.imports || [],
      exports: options.exports || [],
      controllers: []
    };
    
    modules.set(name, entry);
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
      controllers.set(entry.path, entry);
    },

    getControllerMetadata(filePath: string): ControllerEntry | undefined {
      return controllers.get(filePath);
    },

    getAllControllersMetadata(): ControllerEntry[] {
      return Array.from(controllers.values());
    },

    getRawModule(name: string): ModuleEntry | undefined {
      return modules.get(name);
    },

    clearRegistry(): void {
      modules.clear();
      aliases.clear();
      controllers.clear();
    }
  };
}

/**
 * AsyncLocalStorage context that holds the active registry for the current execution scope.
 * Populated by createApp() — all code running within that scope can retrieve
 * the registry via getActiveRegistry().
 */
export const registryContext = new AsyncLocalStorage<InternalRegistry>();

/**
 * Returns the registry bound to the current async execution context.
 * Throws REGISTRY_MISSING_CONTEXT if called outside a createApp() scope.
 * @internal — not exported from index.ts
 */
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

/**
 * Publicly exported function that returns a read-only (stable/advanced) view
 * of the registry active in the current async context.
 */
export const getRegistry = (): NodulusRegistryAdvanced => getActiveRegistry();
