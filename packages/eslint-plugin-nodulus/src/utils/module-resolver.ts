import * as fs from 'node:fs';
import * as path from 'node:path';

const domainCache = new Map<string, string | null>();
const sharedAllowedCache = new Map<string, string[] | null>();
const moduleImportsCache = new Map<string, string[]>();

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

export function getDomainSharedAllowed(sharedIndexPath: string): string[] | null {
  if (sharedAllowedCache.has(sharedIndexPath)) {
    return sharedAllowedCache.get(sharedIndexPath)!;
  }

  let result: string[] | null = null;
  
  try {
    if (fs.existsSync(sharedIndexPath)) {
      const code = fs.readFileSync(sharedIndexPath, 'utf-8');
      
      const match = code.match(/DomainShared\s*\(\s*['"][^'"]+['"]\s*,\s*\{[\s\S]*?allowedDomains\s*:\s*\[([\s\S]*?)\]/);
      if (match && match[1]) {
        const rawArray = match[1];
        result = rawArray
          .split(',')
          .map(s => s.replace(/['"`]/g, '').trim())
          .filter(Boolean);
      }
    }
  } catch (_error) {
    // Graceful fail on read issues
  }

  sharedAllowedCache.set(sharedIndexPath, result);
  return result;
}

function resolveModuleIndex(filePath: string): string | null {
  const dir = path.dirname(filePath);
  const extensions = ['.ts', '.js', '.mts', '.mjs'];

  for (const ext of extensions) {
    const candidate = path.join(dir, `index${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }

  const parentDir = path.dirname(dir);
  for (const ext of extensions) {
    const candidate = path.join(parentDir, `index${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

export function getModuleImports(filePath: string): string[] | null {
  const indexPath = resolveModuleIndex(filePath);
  if (!indexPath) return null;

  if (moduleImportsCache.has(indexPath)) {
    return moduleImportsCache.get(indexPath)!;
  }

  try {
    const code = fs.readFileSync(indexPath, 'utf-8');
    const match = code.match(/imports\s*:\s*\[([\s\S]*?)\]/);
    
    if (!match) {
      moduleImportsCache.set(indexPath, []);
      return [];
    }

    const rawElements = match[1].split(',').map(s => s.trim()).filter(Boolean);
    const result: string[] = [];
    let hasNonLiteral = false;

    for (const elem of rawElements) {
      if (elem.startsWith('...')) {
        hasNonLiteral = true;
        continue;
      }

      const strMatch = elem.match(/^['"`](.*)['"`]$/);
      if (strMatch) {
        if (strMatch[1] !== '') {
          result.push(strMatch[1]);
        }
      } else {
        if (elem !== '') hasNonLiteral = true;
      }
    }

    if (hasNonLiteral) {
      console.warn(`[Nodulus] Warning: Found non-literal element (spread, variable, or expression) in imports array at ${indexPath}. These won't be statically analyzable.`);
    }

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
