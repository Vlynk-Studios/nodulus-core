import { NodulusError } from './errors.js';
import type { 
  ModuleEntry, 
  RegisteredModule, 
  NodulusRegistryAdvanced 
} from '../types/index.js';

// Private internal structure
const modules = new Map<string, ModuleEntry>();
const aliases = new Map<string, string>();

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
  registerModule(entry: ModuleEntry): void;
  /** Adds an alias to the registry */
  registerAlias(alias: string, path: string): void;
  /** Gets the raw module entry (with router, middlewares, etc.) */
  getRawModule(name: string): ModuleEntry | undefined;
  /** Clears the registry (useful for tests) */
  clear(): void;
}

export const registry: InternalRegistry = {
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

  registerModule(entry: ModuleEntry): void {
    if (modules.has(entry.name)) {
      throw new NodulusError(
        'DUPLICATE_MODULE',
        `A module with this name already exists. Each module must have a unique name.`,
        `Module name: ${entry.name}`
      );
    }
    modules.set(entry.name, entry);
  },

  registerAlias(alias: string, targetPath: string): void {
    aliases.set(alias, targetPath);
  },

  getRawModule(name: string): ModuleEntry | undefined {
    return modules.get(name);
  },

  clear(): void {
    modules.clear();
    aliases.clear();
  }
};

/**
 * Publicly exported function that returns a read-only version (stable/advanced interface)
 */
export const getRegistry = (): NodulusRegistryAdvanced => registry;
