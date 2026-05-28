import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from '../../src/bootstrap/createApp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceUrl = pathToFileURL(path.resolve(__dirname, '../../src/index.ts')).href;

const runInTmpApp = async (files: Record<string, string>, tests: (tmpDir: string, app: any) => Promise<void>) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-p3-test-'));
  
  for (const [name, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const finalContent = content.replace(/\{\{SOURCE\}\}/g, sourceUrl);
    fs.writeFileSync(fullPath, finalContent);
  }

  // Inject mandatory ESM package.json
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }));
  
  const mockApp = {
    use: vi.fn(),
  };

  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

  try {
    await tests(tmpDir, mockApp);
  } finally {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

describe('P3 Alias Validation', () => {
  const baseStructure = {
    'src/modules/users/index.ts': `
      import { Module } from '{{SOURCE}}';
      Module('users');
    `,
  };

  it('should throw ALIAS_RESERVED if the config defines @modules', async () => {
    await runInTmpApp(baseStructure, async (tmpDir, app) => {
      fs.writeFileSync(path.join(tmpDir, 'nodulus.config.js'), 'export default { aliases: { "@modules": "./custom-modules" } };');
      
      await expect(createApp(app as any)).rejects.toMatchObject({
        code: 'ALIAS_RESERVED'
      });
    });
  });

  it('should throw INVALID_ALIAS_KEY if a config key includes a wildcard', async () => {
    await runInTmpApp(baseStructure, async (tmpDir, app) => {
      fs.writeFileSync(path.join(tmpDir, 'config.ts'), 'export default {}');
      
      fs.writeFileSync(path.join(tmpDir, 'nodulus.config.js'), 'export default { aliases: { "@config/*": "./config.ts" }, strict: true };');
      
      await expect(createApp(app as any)).rejects.toMatchObject({
        code: 'INVALID_ALIAS_KEY'
      });
    });
  });

  it('should warn if an alias target points to a non-existent path', async () => {
    const logger = vi.fn();
    await runInTmpApp(baseStructure, async (tmpDir, app) => {
      fs.writeFileSync(path.join(tmpDir, 'nodulus.config.js'), 'export default { aliases: { "@config": "./does-not-exist.ts" }, strict: false };');
      
      await createApp(app as any, { logger });

      expect(logger).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('path does not exist'),
        expect.objectContaining({ _module: 'config' })
      );
    });
  });

  it('should support alias to an individual file', async () => {
    await runInTmpApp(baseStructure, async (tmpDir, app) => {
      const filePath = path.join(tmpDir, 'db.ts');
      fs.writeFileSync(filePath, 'export const db = {}');
      
      fs.writeFileSync(path.join(tmpDir, 'nodulus.config.js'), 'export default { aliases: { "@db": "./db.ts" } };');
      
      const nodulusApp = await createApp(app as any);

      const aliases = nodulusApp.registry.getAllAliases();
      expect(aliases['@db']).toBe(path.resolve(tmpDir, 'db.ts'));
    });
  });

  it('should emit debug log for custom alias registration', async () => {
    const logger = vi.fn();
    await runInTmpApp(baseStructure, async (tmpDir, app) => {
      fs.mkdirSync(path.join(tmpDir, 'common'));
      
      fs.writeFileSync(path.join(tmpDir, 'nodulus.config.js'), 'export default { aliases: { "@common": "./common" }, logLevel: "debug" };');
      await createApp(app as any, { logger });

      expect(logger).toHaveBeenCalledWith(
        'debug',
        expect.stringMatching(/Alias registered: @common → .*common/),
        expect.objectContaining({ source: 'config' })
      );
    });
  });
});
