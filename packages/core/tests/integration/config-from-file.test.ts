import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApp } from "../../src/bootstrap/createApp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceUrl = pathToFileURL(
  path.resolve(__dirname, "../../src/index.ts"),
).href;

const runInTmpApp = async (
  files: Record<string, string>,
  tests: (tmpDir: string, app: ReturnType<typeof makeMockApp>) => Promise<void>,
) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nodulus-cfg-integration-"));

  for (const [name, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const finalContent = content.replace(/\{\{SOURCE\}\}/g, sourceUrl);
    fs.writeFileSync(fullPath, finalContent);
  }

  fs.writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ type: "module" }),
  );

  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);

  try {
    await tests(tmpDir, makeMockApp());
  } finally {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

function makeMockApp() {
  return { use: vi.fn() };
}

describe("Integration: Config From File", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("moduleLoadTimeoutMs", () => {
    it("Bootstrap OK if module load time is within moduleLoadTimeoutMs", async () => {
      await runInTmpApp(
        {
          "nodulus.config.js": "export default { strict: false, moduleLoadTimeoutMs: 500 };",
          "src/modules/slow/index.ts": `
            import { Module } from '{{SOURCE}}';
            Module('slow');
            await new Promise(r => setTimeout(r, 200));
          `,
        },
        async (_, app) => {
          const result = await createApp(app as any);
          expect(result.modules).toHaveLength(1);
          expect(result.modules[0].name).toBe("slow");
        }
      );
    });

    it("throws MODULE_LOAD_TIMEOUT if module load exceeds moduleLoadTimeoutMs", async () => {
      await runInTmpApp(
        {
          "nodulus.config.js": "export default { strict: false, moduleLoadTimeoutMs: 100 };",
          "src/modules/slow/index.ts": `
            import { Module } from '{{SOURCE}}';
            Module('slow');
            await new Promise(r => setTimeout(r, 200));
          `,
        },
        async (_, app) => {
          await expect(createApp(app as any)).rejects.toMatchObject({
            code: "MODULE_LOAD_TIMEOUT",
          });
        }
      );
    });
  });

  describe("strict mode", () => {
    it("throws UNDECLARED_IMPORT in strict: true for cross-module undeclared imports", async () => {
      await runInTmpApp(
        {
          "nodulus.config.js": "export default { strict: true };",
          "src/modules/mod-a/index.ts": `
            import { Module } from '{{SOURCE}}';
            Module('mod-a', { exports: ['a'] });
            export const a = 1;
          `,
          "src/modules/mod-b/index.ts": `
            import { Module } from '{{SOURCE}}';
            Module('mod-b'); // Doesn't declare import 'mod-a'
          `,
          "src/modules/mod-b/use.ts": `
            import { a } from '@modules/mod-a';
          `
        },
        async (_, app) => {
          await expect(createApp(app as any)).rejects.toMatchObject({
            code: "UNDECLARED_IMPORT",
          });
        }
      );
    });

    it("emits warn instead of throwing in strict: false for cross-module undeclared imports", async () => {
      const loggerSpy = vi.fn();
      await runInTmpApp(
        {
          "nodulus.config.js": "export default { strict: false };",
          "src/modules/mod-a/index.ts": `
            import { Module } from '{{SOURCE}}';
            Module('mod-a', { exports: ['a'] });
            export const a = 1;
          `,
          "src/modules/mod-b/index.ts": `
            import { Module } from '{{SOURCE}}';
            Module('mod-b'); // Doesn't declare import 'mod-a'
          `,
          "src/modules/mod-b/use.ts": `
            import { a } from '@modules/mod-a';
          `
        },
        async (_, app) => {
          const result = await createApp(app as any, { logger: loggerSpy });
          expect(result.modules).toHaveLength(2);
          
          expect(loggerSpy).toHaveBeenCalledWith(
            "warn",
            expect.stringContaining("but it is not declared in imports[]"),
            expect.any(Object)
          );
        }
      );
    });
  });

  describe("prefix and logLevel", () => {
    it("mounts routes with the configured prefix", async () => {
      await runInTmpApp(
        {
          "nodulus.config.js": "export default { prefix: '/api/v1' };",
          "src/modules/api/index.ts": `
            import { Module } from '{{SOURCE}}';
            Module('api');
          `,
          "src/modules/api/routes.ts": `
            import { Controller } from '{{SOURCE}}';
            Controller('/test');
            const router = function() {};
            router.use = function() {};
            router.stack = [ { route: { path: '/ping', methods: { get: true } } } ];
            export default router;
          `,
        },
        async (_, app) => {
          const result = await createApp(app as any);
          expect(result.routes).toHaveLength(1);
          expect(result.routes[0].path).toBe('/api/v1/test/ping');
        }
      );
    });

    it("only emits error logs when logLevel is 'error'", async () => {
      const loggerSpy = vi.fn();
      await runInTmpApp(
        {
          "nodulus.config.js": "export default { logLevel: 'error' };",
          "src/modules/dummy/index.ts": `
            import { Module } from '{{SOURCE}}';
            Module('dummy');
          `
        },
        async (_, app) => {
          await createApp(app as any, { logger: loggerSpy });
          
          // Verify no 'info' or 'debug' or 'warn' logs were emitted
          const nonErrorCalls = loggerSpy.mock.calls.filter(call => call[0] !== 'error');
          expect(nonErrorCalls).toHaveLength(0);
        }
      );
    });
  });
});
