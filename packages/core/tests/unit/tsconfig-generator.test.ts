import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  generateTsconfigNodulus,
  writeTsconfigNodulus,
  ensureTsconfigExtends,
} from '../../src/config/tsconfig-generator.js';
import type { ResolvedNodulusConfig } from '../../src/config/nodulus-config.js';
import { defaultLogHandler } from '../../src/core/logger.js';

const mkTmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-tsconfig-test-'));

describe('tsconfig-generator', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkTmp();
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const createDummyConfig = (
    resolvedAliases: Map<string, string>,
    modulesTarget = 'src/modules/*',
  ): ResolvedNodulusConfig => ({
    modules: modulesTarget,
    prefix: '',
    strict: true,
    resolveAliases: true,
    logger: defaultLogHandler,
    logLevel: 'info',
    logFormat: 'auto',
    nits: { enabled: true },
    requirePreloader: false,
    moduleLoadTimeoutMs: 30000,
    aliases: {},
    resolvedAliases,
  });

  describe('generateTsconfigNodulus', () => {
    it('generates base @modules/* alias', () => {
      const config = createDummyConfig(new Map());
      const result = generateTsconfigNodulus(config, tmpDir);

      expect(result.compilerOptions.paths).toEqual({
        '@modules/*': ['./src/modules/*'],
      });
      expect(result._generated).toContain('Este archivo es generado automáticamente');
    });

    it('generates wildcard and direct paths for directory aliases', () => {
      const sharedDir = path.join(tmpDir, 'shared');
      fs.mkdirSync(sharedDir, { recursive: true });

      const config = createDummyConfig(new Map([['@shared', sharedDir]]));
      const result = generateTsconfigNodulus(config, tmpDir);

      expect(result.compilerOptions.paths['@shared']).toEqual(['./shared']);
      expect(result.compilerOptions.paths['@shared/*']).toEqual(['./shared/*']);
    });

    it('generates only direct path for file aliases', () => {
      const dbFile = path.join(tmpDir, 'db.ts');
      fs.writeFileSync(dbFile, '');

      const config = createDummyConfig(new Map([['@db', dbFile]]));
      const result = generateTsconfigNodulus(config, tmpDir);

      expect(result.compilerOptions.paths['@db']).toEqual(['./db.ts']);
      expect(result.compilerOptions.paths['@db/*']).toBeUndefined();
    });

    it('points bare directory alias to index.ts if it exists', () => {
      const configDir = path.join(tmpDir, 'config');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'index.ts'), '');

      const config = createDummyConfig(new Map([['@config', configDir]]));
      const result = generateTsconfigNodulus(config, tmpDir);

      expect(result.compilerOptions.paths['@config']).toEqual(['./config/index.ts']);
      expect(result.compilerOptions.paths['@config/*']).toEqual(['./config/*']);
    });
  });

  describe('writeTsconfigNodulus', () => {
    it('writes the tsconfig file', async () => {
      const config = createDummyConfig(new Map());
      await writeTsconfigNodulus(config, tmpDir);

      const outputPath = path.join(tmpDir, 'tsconfig.nodulus.json');
      expect(fs.existsSync(outputPath)).toBe(true);
      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).toContain('@modules/*');
    });

    it('does not write if content is identical', async () => {
      const config = createDummyConfig(new Map());
      await writeTsconfigNodulus(config, tmpDir);
      
      const outputPath = path.join(tmpDir, 'tsconfig.nodulus.json');
      const statsBefore = fs.statSync(outputPath);
      
      // Wait a moment to ensure mtime would change
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await writeTsconfigNodulus(config, tmpDir);
      const statsAfter = fs.statSync(outputPath);
      
      expect(statsAfter.mtimeMs).toBe(statsBefore.mtimeMs);
    });

    it('writes if content differs', async () => {
       const config1 = createDummyConfig(new Map());
       await writeTsconfigNodulus(config1, tmpDir);
       
       const outputPath = path.join(tmpDir, 'tsconfig.nodulus.json');
       const statsBefore = fs.statSync(outputPath);
       
       await new Promise(resolve => setTimeout(resolve, 100)); // Needed on some FS for mtime diff
       
       const config2 = createDummyConfig(new Map([['@test', path.join(tmpDir, 'test.ts')]]));
       fs.writeFileSync(path.join(tmpDir, 'test.ts'), '');
       await writeTsconfigNodulus(config2, tmpDir);
       
       const statsAfter = fs.statSync(outputPath);
       expect(statsAfter.mtimeMs).not.toBe(statsBefore.mtimeMs);
    });

    it('warns on write error', async () => {
      const mockLog = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };
      const config = createDummyConfig(new Map());
      
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('EACCES');
      });

      await writeTsconfigNodulus(config, tmpDir, mockLog as any);
      
      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining('No se pudo escribir'),
        expect.any(Object)
      );

      writeSpy.mockRestore();
    });
  });

  describe('ensureTsconfigExtends', () => {
    it('infos if tsconfig.json does not exist', async () => {
      const mockLog = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };
      await ensureTsconfigExtends(tmpDir, mockLog as any);
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining('tsconfig.json no encontrado'),
        expect.any(Object)
      );
    });

    it('infos if tsconfig.json does not extend nodulus', async () => {
      const mockLog = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
      await ensureTsconfigExtends(tmpDir, mockLog as any);
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining('Agrega "extends": "./tsconfig.nodulus.json"'),
        expect.any(Object)
      );
    });

    it('does nothing if tsconfig.json already extends nodulus (string)', async () => {
      const mockLog = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{"extends": "./tsconfig.nodulus.json"}');
      await ensureTsconfigExtends(tmpDir, mockLog as any);
      expect(mockLog.info).not.toHaveBeenCalled();
    });

    it('does nothing if tsconfig.json already extends nodulus (array)', async () => {
      const mockLog = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{"extends": ["./base.json", "./tsconfig.nodulus.json"]}');
      await ensureTsconfigExtends(tmpDir, mockLog as any);
      expect(mockLog.info).not.toHaveBeenCalled();
    });
    
    it('silently ignores invalid json', async () => {
       const mockLog = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };
       fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{invalid: json');
       await ensureTsconfigExtends(tmpDir, mockLog as any);
       expect(mockLog.info).not.toHaveBeenCalled();
    });
  });
});
