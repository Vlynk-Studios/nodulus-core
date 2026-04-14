import { describe, it, expect } from 'vitest';
import { generateModuleId, isValidModuleId } from '../../src/nits/nits-id.js';

describe('NITS ID Utility', () => {
  it('should generate IDs with the correct format', () => {
    const id = generateModuleId();
    expect(isValidModuleId(id)).toBe(true);
    expect(id).toMatch(/^mod_[0-9a-f]{8}$/);
  });

  it('should generate distinct IDs on consecutive calls', () => {
    const id1 = generateModuleId();
    const id2 = generateModuleId();
    expect(id1).not.toBe(id2);
  });

  it('should reject malformed IDs in isValidModuleId', () => {
    expect(isValidModuleId('mod_123')).toBe(false);
    expect(isValidModuleId('mod_1234567g')).toBe(false); // non-hex
    expect(isValidModuleId('module_12345678')).toBe(false); // wrong prefix
    expect(isValidModuleId('mod_123456789')).toBe(false); // too long
  });
  
  it('should guarantee uniqueness when existing IDs are provided', () => {
    const existingIds = new Set(['mod_00000000', 'mod_11111111']);
    const newId = generateModuleId(existingIds);
    expect(existingIds.has(newId)).toBe(false);
  });
});
