import { randomBytes } from 'node:crypto';

/**
 * Generates a stable but unique identifier for a module.
 * Format: mod_[8 random hex chars]
 */
export function generateNitsId(): string {
  const chars = randomBytes(4).toString('hex');
  return `mod_${chars}`;
}

/**
 * Validates if a string is a valid NITS ID.
 */
export function isValidNitsId(id: string): boolean {
  return /^mod_[0-9a-f]{8}$/.test(id);
}
