import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, DEFAULTS } from '../../src/core/config.js';

describe('Core: loadConfig V0.3.0', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runInTmpDir = async (files: Record<string, string>, tests: (tmpDir: string) => Promise<void>) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-tests-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(tmpDir, name), content);
    }
    
    try {
      await tests(tmpDir);
    } finally {
      vi.restoreAllMocks();
      // Cleanup files
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };

  it('should return only defaults when no config file exists', async () => {
    await runInTmpDir({}, async () => {
      const config = await loadConfig();

      expect(config.modules).toBe(DEFAULTS.modules);
      expect(config.prefix).toBe(DEFAULTS.prefix);
      expect(config.aliases).toEqual(DEFAULTS.aliases);
      expect(config.strict).toBe(DEFAULTS.strict);
      expect(config.resolveAliases).toBe(DEFAULTS.resolveAliases);
      expect(typeof config.logger).toBe('function');
    });
  });

  it('should overwrite defaults dynamically with the config file values', async () => {
    // Generate JS file because running TS dynamically requires tsx / special loaders in pure nodulus run environment
    await runInTmpDir({
      'nodulus.config.js': 'export default { prefix: "/file-prefix", strict: false };'
    }, async () => {
      const config = await loadConfig();
      expect(config.prefix).toBe('/file-prefix');
      expect(config.strict).toBe(false);
      // Fallback
      expect(config.modules).toBe(DEFAULTS.modules);
    });
  });

  it('should prioritize inline options over config file values', async () => {
    await runInTmpDir({
      'nodulus.config.js': 'export default { prefix: "/file-prefix", strict: false };'
    }, async () => {
      const config = await loadConfig({ prefix: '/options-prefix' });
      expect(config.prefix).toBe('/options-prefix'); // From options
      expect(config.strict).toBe(false); // From file
    });
  });

  it('should throw clear error context when config file has a syntax error', async () => {
    await runInTmpDir({
      'nodulus.config.js': 'module.exports = { prefix: "/fail", invalid-syntax here };'
    }, async () => {
      await expect(loadConfig()).rejects.toThrowError(/\[Nodulus\] Failed to parse or evaluate config file at/);
    });
  });
});
