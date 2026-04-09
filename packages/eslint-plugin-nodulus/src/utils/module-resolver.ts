import * as fs from 'node:fs';

const domainCache = new Map<string, string | null>();
const sharedAllowedCache = new Map<string, string[] | null>();

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
