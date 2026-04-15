import path from 'node:path';

/**
 * Calculates the likely alias based on a file path.
 * 
 * Logic:
 * - src/modules/users -> @modules/users
 * - src/domains/billing/modules/payments -> @billing/payments
 */
export function calculateAlias(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  
  // Try to find domain structure: domains/<domain>/modules/<name>
  const domainsIdx = parts.indexOf('domains');
  if (domainsIdx !== -1 && parts.length > domainsIdx + 3 && parts[domainsIdx + 2] === 'modules') {
    const domain = parts[domainsIdx + 1];
    const name = parts[domainsIdx + 3];
    return `@${domain}/${name}`;
  }
  
  // Try to find standard structure: modules/<name>
  const modulesIdx = parts.indexOf('modules');
  if (modulesIdx !== -1 && parts.length > modulesIdx + 1) {
    const name = parts[modulesIdx + 1];
    return `@modules/${name}`;
  }

  // Fallback: use basename as module name under @modules
  return `@modules/${path.basename(filePath)}`;
}
