import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createModuleCommand } from "../../src/cli/commands/create-module.js";

describe("CLI: create-module", () => {
  let _mockExit: any;
  let mockConsoleError: any;
  let _mockConsoleLog: any;
  let exitError: Error;
  const testModuleDir = path.resolve(
    process.cwd(),
    "tests",
    ".tmp",
    "create-module-test",
  );

  beforeEach(() => {
    // Mock process.exit to prevent the process from actually dying during tests.
    // Throw an error to stop execution flow, similar to what process.exit would do.
    exitError = new Error("PROCESS_EXIT");
    _mockExit = vi.spyOn(process, "exit").mockImplementation(((
      _code?: number,
    ) => {
      throw exitError;
    }) as any);
    mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    _mockConsoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    // Clean up tmp dir if exists
    if (fs.existsSync(testModuleDir)) {
      fs.rmSync(testModuleDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(testModuleDir)) {
      fs.rmSync(testModuleDir, { recursive: true, force: true });
    }
  });

  const runCommand = async (args: string[]) => {
    const cmd = createModuleCommand();
    // commander expects node executable as first arg, script as second
    await cmd.parseAsync(["node", "cli", ...args]);
  };

  it("generates the correct files at the specified path", async () => {
    await runCommand(["testmodule", "--path", testModuleDir]);

    expect(fs.existsSync(testModuleDir)).toBe(true);
    expect(fs.existsSync(path.join(testModuleDir, "index.ts"))).toBe(true);
    expect(
      fs.existsSync(path.join(testModuleDir, "testmodule.routes.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(testModuleDir, "testmodule.service.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(testModuleDir, "testmodule.repository.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(testModuleDir, "testmodule.schema.ts")),
    ).toBe(true);
  });

  it("--no-repository omits the repository file generation", async () => {
    await runCommand([
      "testmodule",
      "--path",
      testModuleDir,
      "--no-repository",
    ]);

    expect(fs.existsSync(path.join(testModuleDir, "index.ts"))).toBe(true);
    expect(
      fs.existsSync(path.join(testModuleDir, "testmodule.routes.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(testModuleDir, "testmodule.repository.ts")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(testModuleDir, "testmodule.schema.ts")),
    ).toBe(true);
  });

  it("--no-schema omits the schema file generation", async () => {
    await runCommand(["testmodule", "--path", testModuleDir, "--no-schema"]);

    expect(fs.existsSync(path.join(testModuleDir, "index.ts"))).toBe(true);
    expect(
      fs.existsSync(path.join(testModuleDir, "testmodule.routes.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(testModuleDir, "testmodule.repository.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(testModuleDir, "testmodule.schema.ts")),
    ).toBe(false);
  });

  it("throws a descriptive error when name contains uppercase letters or spaces", async () => {
    await expect(
      runCommand(["Invalid Name", "--path", testModuleDir]),
    ).rejects.toThrowError(exitError);

    expect(mockConsoleError).toHaveBeenCalled();
    const errorMsg = mockConsoleError.mock.calls[0][0];
    expect(errorMsg).toMatch(/Invalid module name/i);

    expect(fs.existsSync(testModuleDir)).toBe(false);
  });

  it("forces generation of .js files when --js is passed", async () => {
    await runCommand(["testmodule", "--path", testModuleDir, "--js"]);

    expect(fs.existsSync(path.join(testModuleDir, "index.js"))).toBe(true);
    expect(fs.existsSync(path.join(testModuleDir, "testmodule.routes.js"))).toBe(true);
    expect(fs.existsSync(path.join(testModuleDir, "index.ts"))).toBe(false);
  });

  it("forces generation of .ts files when --ts is passed", async () => {
    await runCommand(["testmodule", "--path", testModuleDir, "--ts"]);

    expect(fs.existsSync(path.join(testModuleDir, "index.ts"))).toBe(true);
    expect(fs.existsSync(path.join(testModuleDir, "testmodule.routes.ts"))).toBe(true);
    expect(fs.existsSync(path.join(testModuleDir, "index.js"))).toBe(false);
  });

  it("throws a descriptive error when the target directory already exists", async () => {
    // Pre-create the directory to trigger the clash
    fs.mkdirSync(testModuleDir, { recursive: true });

    await expect(
      runCommand(["testmodule", "--path", testModuleDir]),
    ).rejects.toThrowError(exitError);

    expect(mockConsoleError).toHaveBeenCalled();
    const errorMsg = mockConsoleError.mock.calls[0][0];
    expect(errorMsg).toMatch(/already exists/i);
  });

  it("generates a schema without hardcoding zod dependency", async () => {
    await runCommand(["testmodule", "--path", testModuleDir]);
    
    const schemaFile = path.join(testModuleDir, "testmodule.schema.ts");
    expect(fs.existsSync(schemaFile)).toBe(true);

    const schemaContent = fs.readFileSync(schemaFile, 'utf8');

    // Test: el schema generado NO contiene import { z } from 'zod' (activado)
    expect(schemaContent).not.toMatch(/^import\s+\{\s*z\s*\}\s+from\s+['"]zod['"]/m);
    // Test: el schema generado SÍ contiene Schema(' call
    expect(schemaContent).toMatch(/Schema\('TestmoduleSchema'/);
    // Ensure the zod import is commented out safely behind a suggestion
    expect(schemaContent).toMatch(/\/\/\s*import\s+\{\s*z\s*\}\s+from\s+['"]zod['"]/);
  });
});
