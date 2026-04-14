import { randomBytes } from 'node:crypto';

/**
 * Generates a stable and unique identifier for a module.
 * Format: mod_[8 random hex chars]
 * 
 * @param existingIds Optional set of IDs to ensure uniqueness
 */
export function generateModuleId(existingIds: Set<string> = new Set()): string {
  let id: string;
  do {
    const chars = randomBytes(4).toString('hex');
    id = `mod_${chars}`;
  } while (existingIds.has(id));
  
  return id;
}

/**
 * Validates if a string is a valid NITS module ID.
 */
export function isValidModuleId(id: string): boolean {
  return /^mod_[0-9a-f]{8}$/.test(id);
}
