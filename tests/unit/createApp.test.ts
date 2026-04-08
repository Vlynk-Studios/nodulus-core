import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from '../../src/bootstrap/createApp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceUrl = pathToFileURL(path.resolve(__dirname, '../../src/index.ts')).href;

const runInTmpApp = async (files: Record<string, string>, tests: (tmpDir: string, app: any) => Promise<void>) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-app-test-'));
  
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

describe('Core: createApp Integration V0.5.0', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validAppStructure = {
    'nodulus.config.js': `
      export default { prefix: '/api', strict: false };
    `,
    'src/modules/users/index.ts': `
      import { Module } from '{{SOURCE}}';
      Module('users');
    `,
    'src/modules/users/controller.ts': `
      import { Controller } from '{{SOURCE}}';
      Controller('/users');
      const fakeRouter = function() {};
      fakeRouter.use = function() {};
      fakeRouter.stack = [
        { route: { path: '/me', methods: { get: true } } }
      ];
      export default fakeRouter;
    `
  };

  it('should mount discovered routes and return NodulusApp shape', async () => {
    await runInTmpApp(validAppStructure, async (_, app) => {
      const nodulusApp = await createApp(app as any);

      // Verify mounting occurred
      expect(app.use).toHaveBeenCalledTimes(1);
      
      // Verify the returned properties
      expect(nodulusApp.modules).toHaveLength(1);
      expect(nodulusApp.modules[0].name).toBe('users');
      expect(nodulusApp.routes).toHaveLength(1);
      expect(nodulusApp.routes[0]).toEqual({
        method: 'GET',
        path: '/api/users/me',
        module: 'users',
        controller: 'controller'
      });
      expect(nodulusApp.registry).toBeDefined();
    });
  });

  it('should maintain atomic failure and prevent any route mount if a module is invalid', async () => {
    const invalidAppStructure: Record<string, string> = { ...validAppStructure };
    // This file deliberately fails validation!
    invalidAppStructure['src/modules/auth/index.ts'] = `
      // Missing Module() call!
    `;

    await runInTmpApp(invalidAppStructure, async (_, app) => {
      await expect(createApp(app as any)).rejects.toMatchObject({
        code: 'MODULE_NOT_FOUND'
      });
      
      // Atomic failure guarantee: no routes should be mounted if the pipeline exploded prematurely.
      expect(app.use).not.toHaveBeenCalled();
    });
  });

  describe('Logging', () => {
    it('should emit bootstrap:complete with durationMs > 0', async () => {
      const logger = vi.fn();
      await runInTmpApp(validAppStructure, async (_, app) => {
        await createApp(app as any, { logger });
        
        expect(logger).toHaveBeenCalledWith(
          'info',
          expect.stringContaining('Bootstrap complete'),
          expect.objectContaining({ 
            durationMs: expect.any(Number),
            moduleCount: 1,
            routeCount: 1
          })
        );
        
        const lastCall = logger.mock.calls.find(call => call[1].includes('Bootstrap complete'))!;
        expect(lastCall[2].durationMs).toBeGreaterThan(0);
      });
    });

    it('should respect logLevel and suppress info messages when set to warn', async () => {
      const logger = vi.fn();
      await runInTmpApp(validAppStructure, async (_, app) => {
        await createApp(app as any, { logger, logLevel: 'warn' });
        
        // Modules, routes, and bootstrap completion are 'info' level
        const infoCalls = logger.mock.calls.filter(call => call[0] === 'info');
        expect(infoCalls).toHaveLength(0);
      });
    });

    it('should pass structured metadata for module loading', async () => {
      const logger = vi.fn();
      await runInTmpApp(validAppStructure, async (_, app) => {
        await createApp(app as any, { logger });
        
        expect(logger).toHaveBeenCalledWith(
          'info',
          expect.stringMatching(/Module loaded:.*users/),
          expect.objectContaining({
            name: 'users',
            path: expect.any(String)
          })
        );
      });
    });
    it('should log when skipping a disabled controller', async () => {
      const logger = vi.fn();
      const mockStructure = { ...validAppStructure };
      mockStructure['src/modules/users/controller.ts'] = `
        import { Controller } from '{{SOURCE}}';
        Controller('/users', { enabled: false });
        const fakeRouter = function() {};
        fakeRouter.use = function() {};
        fakeRouter.stack = [];
        export default fakeRouter;
      `;
      
      await runInTmpApp(mockStructure, async (_, app) => {
        await createApp(app as any, { logger });
        
        expect(logger).toHaveBeenCalledWith(
          'info',
          expect.stringContaining('is disabled — skipping mount'),
          expect.objectContaining({ 
            name: 'controller', 
            module: 'users' 
          })
        );
      });
    });
  });
});
