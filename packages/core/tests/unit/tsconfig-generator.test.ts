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
    logLevel: 'info',
    logFormat: 'auto',
    nits: { enabled: true },
    requirePreloader: false,
    moduleLoadTimeoutMs: 30000,
    aliases: {},
    resolvedAliases,
  });

  describe('generateTsconfigNodulus()', () => {
    it('with empty aliases generates only the built-in @modules/*', () => {
      const result = generateTsconfigNodulus(createDummyConfig(new Map()), tmpDir);

      expect(Object.keys(result.compilerOptions.paths)).toEqual(['@modules/*']);
      expect(result.compilerOptions.paths['@modules/*']).toEqual(['./src/modules/*']);
    });

    it('with @config pointing to directory generates entries with and without /*', () => {
      const configDir = path.join(tmpDir, 'src', 'config');
      fs.mkdirSync(configDir, { recursive: true });

      const result = generateTsconfigNodulus(
        createDummyConfig(new Map([['@config', configDir]])),
        tmpDir,
      );

      expect(result.compilerOptions.paths['@config']).toEqual(['./src/config']);
      expect(result.compilerOptions.paths['@config/*']).toEqual(['./src/config/*']);
    });

    it('with three directory aliases generates two entries per alias plus @modules/*', () => {
      const configDir = path.join(tmpDir, 'src', 'config');
      const middlewareDir = path.join(tmpDir, 'src', 'middleware');
      const sharedDir = path.join(tmpDir, 'shared');
      for (const dir of [configDir, middlewareDir, sharedDir]) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const result = generateTsconfigNodulus(
        createDummyConfig(
          new Map([
            ['@config', configDir],
            ['@middleware', middlewareDir],
            ['@shared', sharedDir],
          ]),
        ),
        tmpDir,
      );

      const paths = result.compilerOptions.paths;
      expect(Object.keys(paths)).toHaveLength(7);
      expect(paths['@modules/*']).toBeDefined();
      expect(paths['@config']).toBeDefined();
      expect(paths['@config/*']).toBeDefined();
      expect(paths['@middleware']).toBeDefined();
      expect(paths['@middleware/*']).toBeDefined();
      expect(paths['@shared']).toBeDefined();
      expect(paths['@shared/*']).toBeDefined();
    });

    it('@modules/* always uses the built-in glob even if resolvedAliases tries to redefine @modules', () => {
      const customModules = path.join(tmpDir, 'custom-modules');
      fs.mkdirSync(customModules, { recursive: true });
      const configDir = path.join(tmpDir, 'src', 'config');
      fs.mkdirSync(configDir, { recursive: true });

      const result = generateTsconfigNodulus(
        createDummyConfig(
          new Map([
            ['@modules', customModules],
            ['@config', configDir],
          ]),
        ),
        tmpDir,
      );

      expect(result.compilerOptions.paths['@modules/*']).toEqual(['./src/modules/*']);
      expect(result.compilerOptions.paths['@modules']).toBeUndefined();
      expect(result.compilerOptions.paths['@config/*']).toEqual(['./src/config/*']);
    });

    it('generated object is JSON serializable without errors', () => {
      const configDir = path.join(tmpDir, 'src', 'config');
      fs.mkdirSync(configDir, { recursive: true });

      const obj = generateTsconfigNodulus(
        createDummyConfig(new Map([['@config', configDir]])),
        tmpDir,
      );

      expect(() => JSON.stringify(obj)).not.toThrow();
      const parsed = JSON.parse(JSON.stringify(obj));
      expect(parsed.compilerOptions.paths['@config/*']).toEqual(['./src/config/*']);
    });

    it('all paths in compilerOptions.paths are relative to the project (./)', () => {
      const configDir = path.join(tmpDir, 'src', 'config');
      const dbFile = path.join(tmpDir, 'db.ts');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(dbFile, '');

      const result = generateTsconfigNodulus(
        createDummyConfig(
          new Map([
            ['@config', configDir],
            ['@db', dbFile],
          ]),
        ),
        tmpDir,
      );

      for (const targets of Object.values(result.compilerOptions.paths)) {
        for (const target of targets) {
          expect(target.startsWith('./')).toBe(true);
        }
      }
    });

    it('points @config to index.ts when it exists', () => {
      const configDir = path.join(tmpDir, 'config');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'index.ts'), '');

      const result = generateTsconfigNodulus(
        createDummyConfig(new Map([['@config', configDir]])),
        tmpDir,
      );

      expect(result.compilerOptions.paths['@config']).toEqual(['./config/index.ts']);
      expect(result.compilerOptions.paths['@config/*']).toEqual(['./config/*']);
    });

    it('file alias generates only direct entry without /*', () => {
      const dbFile = path.join(tmpDir, 'db.ts');
      fs.writeFileSync(dbFile, '');

      const result = generateTsconfigNodulus(
        createDummyConfig(new Map([['@db', dbFile]])),
        tmpDir,
      );

      expect(result.compilerOptions.paths['@db']).toEqual(['./db.ts']);
      expect(result.compilerOptions.paths['@db/*']).toBeUndefined();
    });

    it('includes the _generated header', () => {
      const result = generateTsconfigNodulus(createDummyConfig(new Map()), tmpDir);
      expect(result._generated).toContain('This file is auto-generated by Nodulus');
    });
  });

  describe('writeTsconfigNodulus()', () => {
    const outputPath = () => path.join(tmpDir, 'tsconfig.nodulus.json');

    it('if file does not exist it creates it with correct content', async () => {
      const configDir = path.join(tmpDir, 'src', 'config');
      fs.mkdirSync(configDir, { recursive: true });
      const config = createDummyConfig(new Map([['@config', configDir]]));

      expect(fs.existsSync(outputPath())).toBe(false);
      await writeTsconfigNodulus(config, tmpDir);

      expect(fs.existsSync(outputPath())).toBe(true);
      const written = JSON.parse(fs.readFileSync(outputPath(), 'utf-8'));
      const expected = generateTsconfigNodulus(config, tmpDir);
      expect(written.compilerOptions.paths).toEqual(expected.compilerOptions.paths);
      expect(written._generated).toBe(expected._generated);
    });

    it('if content is identical it does not rewrite (mtime unchanged)', async () => {
      const config = createDummyConfig(new Map());
      await writeTsconfigNodulus(config, tmpDir);

      const statsBefore = fs.statSync(outputPath());
      await new Promise(resolve => setTimeout(resolve, 15));
      await writeTsconfigNodulus(config, tmpDir);
      const statsAfter = fs.statSync(outputPath());

      expect(statsAfter.mtimeMs).toBe(statsBefore.mtimeMs);
    });

    it('if content differs it overwrites it', async () => {
      const config1 = createDummyConfig(new Map());
      await writeTsconfigNodulus(config1, tmpDir);

      const statsBefore = fs.statSync(outputPath());
      await new Promise(resolve => setTimeout(resolve, 50));

      const config2 = createDummyConfig(
        new Map([['@test', path.join(tmpDir, 'test.ts')]]),
      );
      fs.writeFileSync(path.join(tmpDir, 'test.ts'), '');
      await writeTsconfigNodulus(config2, tmpDir);

      const statsAfter = fs.statSync(outputPath());
      const content = fs.readFileSync(outputPath(), 'utf-8');
      expect(statsAfter.mtimeMs).not.toBe(statsBefore.mtimeMs);
      expect(content).toContain('@test');
    });

    it('without write permissions it emits log.warn and does not throw', async () => {
      const mockLog = {
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
      };
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      });

      await expect(
        writeTsconfigNodulus(createDummyConfig(new Map()), tmpDir, mockLog as never),
      ).resolves.toBeUndefined();

      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not write'),
        expect.objectContaining({ _module: 'config' }),
      );

      writeSpy.mockRestore();
    });
  });

  describe('ensureTsconfigExtends()', () => {
    const hintFragment = 'Add "extends": "./tsconfig.nodulus.json"';

    it('without tsconfig.json it emits log.debug and does not throw', async () => {
      const mockLog = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };

      await expect(ensureTsconfigExtends(tmpDir, mockLog as never)).resolves.toBeUndefined();
      expect(mockLog.debug).toHaveBeenCalledWith(
        expect.stringContaining('tsconfig.json not found'),
        expect.any(Object),
      );
      expect(mockLog.debug).toHaveBeenCalledWith(
        expect.stringContaining(hintFragment),
        expect.any(Object),
      );
    });

    it('tsconfig.json without extends emits log.info with instruction', async () => {
      const mockLog = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');

      await ensureTsconfigExtends(tmpDir, mockLog as never);

      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining(hintFragment),
        expect.objectContaining({ _module: 'config' }),
      );
    });

    it('tsconfig.json with extends to another file emits log.info (does not modify)', async () => {
      const mockLog = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };
      fs.writeFileSync(
        path.join(tmpDir, 'tsconfig.json'),
        JSON.stringify({ extends: './tsconfig.base.json' }),
      );

      await ensureTsconfigExtends(tmpDir, mockLog as never);

      const raw = fs.readFileSync(path.join(tmpDir, 'tsconfig.json'), 'utf-8');
      expect(raw).toContain('./tsconfig.base.json');
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining(hintFragment),
        expect.any(Object),
      );
    });

    it('tsconfig.json with extends to tsconfig.nodulus.json emits nothing', async () => {
      const mockLog = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };
      fs.writeFileSync(
        path.join(tmpDir, 'tsconfig.json'),
        '{"extends": "./tsconfig.nodulus.json"}',
      );

      await ensureTsconfigExtends(tmpDir, mockLog as never);

      expect(mockLog.info).not.toHaveBeenCalled();
    });

    it('tsconfig.json with extends in array including nodulus emits nothing', async () => {
      const mockLog = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };
      fs.writeFileSync(
        path.join(tmpDir, 'tsconfig.json'),
        '{"extends": ["./base.json", "./tsconfig.nodulus.json"]}',
      );

      await ensureTsconfigExtends(tmpDir, mockLog as never);

      expect(mockLog.info).not.toHaveBeenCalled();
    });

    it('invalid tsconfig.json emits nothing and does not throw', async () => {
      const mockLog = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{invalid: json');

      await expect(ensureTsconfigExtends(tmpDir, mockLog as never)).resolves.toBeUndefined();
      expect(mockLog.info).not.toHaveBeenCalled();
    });
  });
});
