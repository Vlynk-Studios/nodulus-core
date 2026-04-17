import path from 'node:path';

/**
 * Normalizes a file path to be consistent across different environments (especially Windows).
 * 
 * - Normalizes slashes to the OS default.
 * - Forces Windows drive letters to Uppercase (e.g., C:\ instead of c:\).
 * - Resolves relative segments.
 */
export function normalizePath(filePath: string): string {
  if (!filePath) return filePath;
  
  // 1. Basic path normalization
  let normalized = path.normalize(filePath).replace(/\\/g, '/');
  
  // 2. Handle Windows drive letter casing
  if (process.platform === 'win32' && /^[a-z]:/i.test(normalized)) {
    normalized = normalized[0].toUpperCase() + normalized.slice(1);
  }
  
  // 3. Ensure we use the standard path.sep (handled by path.normalize mostly, but just in case)
  // We actually prefer sticking to what Node uses internally for consistency.
  
  return normalized;
}
