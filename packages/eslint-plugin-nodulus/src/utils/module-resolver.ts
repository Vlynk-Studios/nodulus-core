import * as fs from 'node:fs';
import * as path from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const domainCache = new Map<string, string | null>();
const sharedAllowedCache = new Map<string, string[] | null>();
const moduleImportsCache = new Map<string, string[]>();
const moduleRootCache = new Map<string, string | null>();
const activeAliasesCache = new Map<string, string[]>();

const CONFIG_CANDIDATES = ['nodulus.config.ts', 'nodulus.config.js', 'nodulus.config.mjs'] as const;
const INDEX_EXTENSIONS = ['.ts', '.js', '.mts', '.mjs'] as const;

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function hasModuleDeclaration(dir: string): boolean {
  for (const ext of INDEX_EXTENSIONS) {
    const indexPath = path.join(dir, `index${ext}`);
    if (fs.existsSync(indexPath) && extractIdentifierCall(indexPath, 'Module')) {
      return true;
    }
  }
  return false;
}

/**
 * Walks upward from `filePath` until an `index` with `Module()` is found.
 * When `modulesDir` is set, also resolves the first segment under that root.
 */
export function findModuleRoot(
  filePath: string,
  cwd: string = process.cwd(),
  modulesDir?: string,
): string | null {
  const cacheKey = `${filePath}|${cwd}|${modulesDir ?? ''}`;
  if (moduleRootCache.has(cacheKey)) {
    return moduleRootCache.get(cacheKey)!;
  }

  const absoluteFile = path.resolve(cwd, filePath);
  let result: string | null = null;

  if (modulesDir) {
    const modulesRoot = path.resolve(cwd, modulesDir);
    const fileNorm = normalizePath(absoluteFile);
    const rootNorm = normalizePath(modulesRoot);
    if (fileNorm.startsWith(`${rootNorm}/`)) {
      const rel = path.relative(modulesRoot, absoluteFile);
      const segment = rel.split(path.sep)[0];
      if (segment) {
        const candidate = path.join(modulesRoot, segment);
        if (hasModuleDeclaration(candidate)) {
          result = candidate;
        }
      }
    }
  }

  if (!result) {
    let dir = path.dirname(absoluteFile);
    const stopAt = path.resolve(cwd);

    while (dir.length >= stopAt.length) {
      if (hasModuleDeclaration(dir)) {
        result = dir;
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  moduleRootCache.set(cacheKey, result);
  return result;
}

/** REGLA-22 — inclusion list of active Nodulus aliases. */
export function isNodulusAlias(specifier: string, activeAliases: readonly string[]): boolean {
  if (!specifier.startsWith('@')) return false;
  return activeAliases.some(
    alias => specifier === alias || specifier.startsWith(`${alias}/`),
  );
}

/**
 * Loads alias keys from `nodulus.config.*` in `cwd`.
 * Falls back to `['@modules']` when no config is found.
 */
export function getActiveNodulusAliases(cwd: string = process.cwd()): string[] {
  if (activeAliasesCache.has(cwd)) {
    return activeAliasesCache.get(cwd)!;
  }

  const aliases = new Set<string>(['@modules']);

  for (const candidate of CONFIG_CANDIDATES) {
    const configPath = path.join(cwd, candidate);
    if (!fs.existsSync(configPath)) continue;

    try {
      const content = fs.readFileSync(configPath, 'utf8');
      for (const match of content.matchAll(/['"](@[a-zA-Z][a-zA-Z0-9-]*)['"]\s*:/g)) {
        aliases.add(match[1]);
      }
      break;
    } catch {
      // unreadable config — keep defaults
    }
  }

  const result = [...aliases];
  activeAliasesCache.set(cwd, result);
  return result;
}

/** Infers the target module folder name when a relative import crosses a boundary. */
export function inferCrossModuleTarget(
  resolvedPath: string,
  moduleRoot: string,
  modulesDir: string | undefined,
  cwd: string,
): string {
  if (modulesDir) {
    const modulesRoot = path.resolve(cwd, modulesDir);
    const rel = path.relative(modulesRoot, resolvedPath);
    const segment = rel.split(path.sep)[0];
    if (segment && !segment.startsWith('.')) return segment;
  }

  const modulesRoot = path.dirname(moduleRoot);
  const sibling = path.relative(modulesRoot, resolvedPath);
  const segment = sibling.split(path.sep)[0];
  return segment && !segment.startsWith('.') ? segment : path.basename(path.dirname(resolvedPath));
}

export function isRelativeBoundaryCrossing(
  specifier: string,
  filePath: string,
  moduleRoot: string,
): boolean {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return false;
  }
  const fileDir = path.dirname(path.resolve(filePath));
  const resolved = path.resolve(fileDir, specifier);
  const root = path.resolve(moduleRoot);
  const rel = path.relative(root, resolved);
  return rel.startsWith('..') || path.isAbsolute(rel);
}

export function getDomainFromFilePath(filePath: string): string | null {
  if (domainCache.has(filePath)) {
    return domainCache.get(filePath)!;
  }

  const normalizedPath = filePath.replace(/\\/g, '/');
  let result: string | null = null;
  
  const match = normalizedPath.match(/\/domains\/([^/]+)\//);
  if (match && match[1]) {
    result = match[1];
  }

  domainCache.set(filePath, result);
  return result;
}

export interface IdentifierCall {
  name: string;
  options: Record<string, unknown>;
}

function extractIdentifierCall(
  filePath: string,
  calleeName: string
): IdentifierCall | null {
  let found: IdentifierCall | null = null;
  try {
    const code = fs.readFileSync(filePath, "utf-8");
    const ast = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
    });

    walk.simple(ast, {
      CallExpression(node: any) {
        if (node.callee.type === 'Identifier' && node.callee.name === calleeName) {
          const nameArg = node.arguments[0];
          if (nameArg && nameArg.type === "Literal") {
            const name = nameArg.value as string;
            const options: Record<string, unknown> = {};

            const optionsArg = node.arguments[1];
            if (optionsArg && optionsArg.type === "ObjectExpression") {
              for (const prop of optionsArg.properties) {
                if (prop.type !== 'Property') continue;
                
                let keyName = '';
                if (prop.key.type === "Identifier") {
                  keyName = prop.key.name;
                } else if (prop.key.type === "Literal") {
                  keyName = String(prop.key.value);
                }

                if (keyName && prop.value.type === "ArrayExpression") {
                  const arr: string[] = [];
                  let hasNonLiteral = false;
                  for (const elem of prop.value.elements) {
                    if (elem && elem.type === "Literal") {
                      arr.push(String(elem.value));
                    } else if (elem) {
                      hasNonLiteral = true;
                    }
                  }
                  if (hasNonLiteral) {
                    console.warn(`[System] Warning: Found non-literal element (spread, variable, or expression) in "${keyName}" array at ${filePath}. These won't be statically analyzable.`);
                  }
                  options[keyName] = arr;
                } else if (keyName && prop.value.type === "Literal") {
                  options[keyName] = prop.value.value;
                }
              }
            }
            found = { name, options };
          }
        }
      },
    });
  } catch (_error) {
    return null;
  }
  return found;
}

export function getDomainSharedAllowed(sharedIndexPath: string): string[] | null {
  if (sharedAllowedCache.has(sharedIndexPath)) {
    return sharedAllowedCache.get(sharedIndexPath)!;
  }

  let result: string[] | null = null;
  
  if (fs.existsSync(sharedIndexPath)) {
    const call = extractIdentifierCall(sharedIndexPath, 'DomainShared');
    if (call && Array.isArray(call.options.allowedDomains)) {
      result = call.options.allowedDomains as string[];
    }
  }

  sharedAllowedCache.set(sharedIndexPath, result);
  return result;
}

export function getModuleImports(
  filePath: string,
  options?: { modulesDir?: string; cwd?: string },
): string[] | null {
  const cwd = options?.cwd ?? process.cwd();
  const moduleRoot = findModuleRoot(filePath, cwd, options?.modulesDir);
  if (!moduleRoot) return null;

  let indexPath: string | null = null;
  for (const ext of INDEX_EXTENSIONS) {
    const candidate = path.join(moduleRoot, `index${ext}`);
    if (fs.existsSync(candidate)) {
      indexPath = candidate;
      break;
    }
  }
  if (!indexPath) return null;

  if (moduleImportsCache.has(indexPath)) {
    return moduleImportsCache.get(indexPath)!;
  }

  try {
    const call = extractIdentifierCall(indexPath, 'Module');
    if (!call || !Array.isArray(call.options.imports)) {
      moduleImportsCache.set(indexPath, []);
      return [];
    }

    const result = call.options.imports as string[];
    moduleImportsCache.set(indexPath, result);
    return result;
  } catch (_e) {
    return null;
  }
}

export function clearDomainCache() {
  domainCache.clear();
}

export function clearSharedAllowedCache() {
  sharedAllowedCache.clear();
}

export function clearModuleImportsCache() {
  moduleImportsCache.clear();
}

export function clearModuleRootCache() {
  moduleRootCache.clear();
}

export function clearActiveAliasesCache() {
  activeAliasesCache.clear();
}

export function clearAllResolverCaches() {
  clearDomainCache();
  clearSharedAllowedCache();
  clearModuleImportsCache();
  clearModuleRootCache();
  clearActiveAliasesCache();
}
