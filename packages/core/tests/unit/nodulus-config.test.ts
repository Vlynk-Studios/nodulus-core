import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadNodulusConfig } from '../../src/config/nodulus-config.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mkTmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-cfg-test-'));

const writeConfig = (dir: string, name: string, content: string) => {
  fs.writeFileSync(path.join(dir, name), content, 'utf-8');
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('loadNodulusConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkTmp();
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── No config file ─────────────────────────────────────────────────────────

  it('returns defaults and emits debug when no config file exists', async () => {
    const log = vi.fn();
    const result = await loadNodulusConfig(tmpDir, log);

    expect(result.resolvedAliases.size).toBe(0);
    expect(log).toHaveBeenCalledWith(
      'debug',
      expect.stringContaining('No nodulus.config found'),
      expect.any(Object),
    );
  });

  // ── Config search order ────────────────────────────────────────────────────

  it('loads nodulus.config.js if present', async () => {
    writeConfig(tmpDir, 'nodulus.config.js', 'export default { prefix: "/api" };');
    const result = await loadNodulusConfig(tmpDir);
    expect(result.prefix).toBe('/api');
  });

  it('loads nodulus.config.mjs if nodulus.config.ts and .js are absent', async () => {
    writeConfig(tmpDir, 'nodulus.config.mjs', 'export default { prefix: "/mjs" };');
    const result = await loadNodulusConfig(tmpDir);
    expect(result.prefix).toBe('/mjs');
  });

  // ── Alias key validation ───────────────────────────────────────────────────

  it('throws INVALID_ALIAS_KEY for a key that does not start with @', async () => {
    writeConfig(tmpDir, 'nodulus.config.js', 'export default { aliases: { "config": "./src" } };');
    await expect(loadNodulusConfig(tmpDir)).rejects.toMatchObject({ code: 'INVALID_ALIAS_KEY' });
  });

  it('throws INVALID_ALIAS_KEY for a bare "@" key', async () => {
    writeConfig(tmpDir, 'nodulus.config.js', 'export default { aliases: { "@": "./src" } };');
    await expect(loadNodulusConfig(tmpDir)).rejects.toMatchObject({ code: 'INVALID_ALIAS_KEY' });
  });

  it('throws INVALID_ALIAS_KEY when the key starts with @ but has no following char', async () => {
    writeConfig(tmpDir, 'nodulus.config.js', 'export default { aliases: { "@1invalid": "./src" } };');
    await expect(loadNodulusConfig(tmpDir)).rejects.toMatchObject({ code: 'INVALID_ALIAS_KEY' });
  });

  // ── Reserved alias validation ──────────────────────────────────────────────

  it('throws ALIAS_RESERVED when the config defines @modules', async () => {
    writeConfig(tmpDir, 'nodulus.config.js', 'export default { aliases: { "@modules": "./custom" } };');
    await expect(loadNodulusConfig(tmpDir)).rejects.toMatchObject({ code: 'ALIAS_RESERVED' });
  });

  it('throws ALIAS_RESERVED when the config defines @shared', async () => {
    writeConfig(tmpDir, 'nodulus.config.js', 'export default { aliases: { "@shared": "./custom" } };');
    await expect(loadNodulusConfig(tmpDir)).rejects.toMatchObject({ code: 'ALIAS_RESERVED' });
  });

  // ── Missing target path (warn, don't throw) ────────────────────────────────

  it('emits warn when alias target does not exist but does not throw', async () => {
    const log = vi.fn();
    writeConfig(tmpDir, 'nodulus.config.js', 'export default { aliases: { "@ghost": "./does-not-exist" } };');
    const result = await loadNodulusConfig(tmpDir, log);

    expect(result.resolvedAliases.has('@ghost')).toBe(true);
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('@ghost'),
      expect.objectContaining({ alias: '@ghost' }),
    );
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('resolves a valid alias to an absolute path', async () => {
    const srcDir = path.join(tmpDir, 'src', 'config');
    fs.mkdirSync(srcDir, { recursive: true });
    writeConfig(tmpDir, 'nodulus.config.js', 'export default { aliases: { "@cfg": "./src/config" } };');

    const result = await loadNodulusConfig(tmpDir);
    expect(result.resolvedAliases.get('@cfg')).toBe(srcDir);
  });

  it('accepts dashes in alias keys', async () => {
    const dir = path.join(tmpDir, 'my-lib');
    fs.mkdirSync(dir, { recursive: true });
    writeConfig(tmpDir, 'nodulus.config.js', 'export default { aliases: { "@my-lib": "./my-lib" } };');

    const result = await loadNodulusConfig(tmpDir);
    expect(result.resolvedAliases.has('@my-lib')).toBe(true);
  });

  it('populates resolvedAliases with absolute paths for all valid aliases', async () => {
    const aDir = path.join(tmpDir, 'a');
    const bFile = path.join(tmpDir, 'b.ts');
    fs.mkdirSync(aDir, { recursive: true });
    fs.writeFileSync(bFile, '');
    writeConfig(
      tmpDir,
      'nodulus.config.js',
      `export default { aliases: { "@a": "./a", "@b": "./b.ts" } };`,
    );

    const result = await loadNodulusConfig(tmpDir);
    expect(result.resolvedAliases.get('@a')).toBe(aDir);
    expect(result.resolvedAliases.get('@b')).toBe(bFile);
  });

  // ── v1.8.0 Config fields parsing and validation ────────────────────────────

  it('parses logLevel correctly when valid', async () => {
    writeConfig(tmpDir, 'nodulus.config.js', 'export default { logLevel: "debug" };');
    const result = await loadNodulusConfig(tmpDir);
    expect(result.logLevel).toBe('debug');
  });

  it('emits warn and falls back to info when logLevel is invalid', async () => {
    const log = vi.fn();
    writeConfig(tmpDir, 'nodulus.config.js', 'export default { logLevel: "verbose" };');
    const result = await loadNodulusConfig(tmpDir, log);
    expect(result.logLevel).toBe('info');
    expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('Invalid logLevel'), expect.any(Object));
  });

  it('parses moduleLoadTimeoutMs correctly when valid', async () => {
    writeConfig(tmpDir, 'nodulus.config.js', 'export default { moduleLoadTimeoutMs: 10000 };');
    const result = await loadNodulusConfig(tmpDir);
    expect(result.moduleLoadTimeoutMs).toBe(10000);
  });

  it('parses requirePreloader correctly', async () => {
    writeConfig(tmpDir, 'nodulus.config.js', 'export default { requirePreloader: true };');
    const result = await loadNodulusConfig(tmpDir);
    expect(result.requirePreloader).toBe(true);
  });

  it('parses resolveAliases correctly', async () => {
    writeConfig(tmpDir, 'nodulus.config.js', 'export default { resolveAliases: false };');
    const result = await loadNodulusConfig(tmpDir);
    expect(result.resolveAliases).toBe(false);
  });

  it('parses all new v1.8.0 fields together correctly', async () => {
    writeConfig(
      tmpDir,
      'nodulus.config.js',
      `export default { 
        logLevel: "error", 
        logFormat: "json",
        moduleLoadTimeoutMs: 15000, 
        requirePreloader: true, 
        resolveAliases: false 
      };`
    );
    const result = await loadNodulusConfig(tmpDir);
    expect(result.logLevel).toBe('error');
    expect(result.logFormat).toBe('json');
    expect(result.moduleLoadTimeoutMs).toBe(15000);
    expect(result.requirePreloader).toBe(true);
    expect(result.resolveAliases).toBe(false);
  });
});
