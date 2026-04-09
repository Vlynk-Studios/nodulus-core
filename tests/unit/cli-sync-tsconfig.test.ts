import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { syncTsconfigCommand } from "../../src/cli/commands/sync-tsconfig.js";
import { loadConfig } from "../../src/core/config.js";

vi.mock("fast-glob", () => ({ default: vi.fn() }));
vi.mock("../../src/core/config.js", () => ({ loadConfig: vi.fn() }));

describe("CLI: sync-tsconfig", () => {
  let _mockExit: any;
  let mockConsoleError: any;
  let _mockConsoleLog: any;
  let exitError: Error;
  
  const testDir = path.resolve(process.cwd(), "tests", ".tmp", "sync-tsconfig");
  const tsconfigPath = path.join(testDir, "tsconfig.test.json");

  beforeEach(() => {
    exitError = new Error("PROCESS_EXIT");
    _mockExit = vi.spyOn(process, "exit").mockImplementation(((_code?: number) => {
      throw exitError;
    }) as any);
    mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    _mockConsoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    // Create a fresh test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  const runCommand = async (args: string[]) => {
    const cmd = syncTsconfigCommand();
    await cmd.parseAsync(["node", "cli", ...args]);
  };

  it("throws a descriptive error if tsconfig.json does not exist", async () => {
    await expect(runCommand(["--tsconfig", "nonexistent.json"])).rejects.toThrowError(exitError);
    expect(mockConsoleError).toHaveBeenCalled();
    const errorMsg = mockConsoleError.mock.calls[0][0];
    expect(errorMsg).toMatch(/Could not find nonexistent.json/i);
  });

  it("adds paths correctly to a tsconfig without previous paths", async () => {
    // 1. Setup mock tsconfig
    const initialConfig = { compilerOptions: { target: "es2022" } /* no paths */ };
    fs.writeFileSync(tsconfigPath, JSON.stringify(initialConfig, null, 2), "utf8");

    // 2. Setup mock modules & configs
    vi.mocked(loadConfig).mockResolvedValue({
      modules: "src/modules/*",
      aliases: { "@config": "./src/config" },
      prefix: "", strict: true, resolveAliases: true, logger: {} as any, logLevel: "info"
    });
    vi.mocked(fg).mockResolvedValue([
      path.resolve(process.cwd(), "src/modules/auth"),
      path.resolve(process.cwd(), "src/modules/users")
    ]);
    
    // Create dummy index files so relative paths work accurately
    fs.mkdirSync(path.resolve(process.cwd(), "src/modules/auth"), { recursive: true });
    fs.writeFileSync(path.resolve(process.cwd(), "src/modules/auth/index.ts"), "");
    fs.mkdirSync(path.resolve(process.cwd(), "src/modules/users"), { recursive: true });
    fs.writeFileSync(path.resolve(process.cwd(), "src/modules/users/index.ts"), "");

    await runCommand(["--tsconfig", tsconfigPath]);

    const result = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
    expect(result.compilerOptions.target).toBe("es2022"); // Did not touch other fields
    expect(result.compilerOptions.paths).toBeDefined();
    expect(result.compilerOptions.paths["@modules/auth"]).toEqual(["./src/modules/auth/index.ts"]);
    expect(result.compilerOptions.paths["@modules/users"]).toEqual(["./src/modules/users/index.ts"]);
    expect(result.compilerOptions.paths["@config/*"]).toEqual(["./src/config/*"]);
    
    // Cleanup generated mock index files
    fs.rmSync(path.resolve(process.cwd(), "src/modules"), { recursive: true, force: true });
  });

  it("overwrites existing paths without modifying the rest of tsconfig, preserving comments", async () => {
    // Note: To test comment preservation we don't use JSON.parse
    const commentedJson = `{
      // testing comment
      "compilerOptions": {
        "paths": {
          "@modules/old": ["./src/modules/old/index.ts"]
        } // another comment
      }
    }`;
    fs.writeFileSync(tsconfigPath, commentedJson, "utf8");

    vi.mocked(loadConfig).mockResolvedValue({
      modules: "src/modules/*",
      aliases: {},
      prefix: "", strict: true, resolveAliases: true, logger: {} as any, logLevel: "info"
    });
    vi.mocked(fg).mockResolvedValue([path.resolve(process.cwd(), "src/modules/new")]);
    fs.mkdirSync(path.resolve(process.cwd(), "src/modules/new"), { recursive: true });
    fs.writeFileSync(path.resolve(process.cwd(), "src/modules/new/index.ts"), "");

    await runCommand(["--tsconfig", tsconfigPath]);

    const rawResult = fs.readFileSync(tsconfigPath, "utf8");
    // Ensure comments survived and JSON modified appropriately
    expect(rawResult).toContain("// testing comment");
    expect(rawResult).toContain("// another comment");
    expect(rawResult).toContain('"@modules/new":');
    
    fs.rmSync(path.resolve(process.cwd(), "src/modules"), { recursive: true, force: true });
  });

  it("is idempotent: running twice produces identical output", async () => {
    const initialConfig = { compilerOptions: { target: "es2022", paths: {} } };
    fs.writeFileSync(tsconfigPath, JSON.stringify(initialConfig, null, 2), "utf8");

    vi.mocked(loadConfig).mockResolvedValue({
      modules: "src/modules/*",
      aliases: {},
      prefix: "", strict: true, resolveAliases: true, logger: {} as any, logLevel: "info"
    });
    vi.mocked(fg).mockResolvedValue([path.resolve(process.cwd(), "src/modules/auth")]);
    fs.mkdirSync(path.resolve(process.cwd(), "src/modules/auth"), { recursive: true });
    fs.writeFileSync(path.resolve(process.cwd(), "src/modules/auth/index.ts"), "");

    await runCommand(["--tsconfig", tsconfigPath]);
    const pass1 = fs.readFileSync(tsconfigPath, "utf8");

    await runCommand(["--tsconfig", tsconfigPath]);
    const pass2 = fs.readFileSync(tsconfigPath, "utf8");

    expect(pass1).toBe(pass2);
    
    fs.rmSync(path.resolve(process.cwd(), "src/modules"), { recursive: true, force: true });
  });

  it("automatically removes nested module paths and stale config aliases, but respects manual user paths", async () => {
    // Seed config with paths simulating a stale module, a stale config alias (satisfies heuristic), and untouchable manual paths
    const initialConfig = { 
      compilerOptions: { 
        paths: {
          "@modules/stale": ["./src/modules/stale/index.ts"],
          "@config/*": ["./src/config/*"],
          "custom-alias": ["./dist"],
          "@manual/*": ["C:/absolute/manual/*"], // Starts with absolute path, fails heuristic
          "@manual-two/*": ["./src/manual", "./src/manual2"] // Array length > 1, fails heuristic
        }
      } 
    };
    fs.writeFileSync(tsconfigPath, JSON.stringify(initialConfig, null, 2), "utf8");

    vi.mocked(loadConfig).mockResolvedValue({
      modules: "src/modules/*",
      aliases: {}, // @config exists no more!
      prefix: "", strict: true, resolveAliases: true, logger: {} as any, logLevel: "info"
    });
    // Returning NO active modules -> Should trigger garbage collection of @modules/stale
    vi.mocked(fg).mockResolvedValue([]);

    await runCommand(["--tsconfig", tsconfigPath]);

    const result = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
    const paths = result.compilerOptions.paths;
    
    expect(paths["@modules/stale"]).toBeUndefined(); // Effectively cleaned
    expect(paths["@config/*"]).toBeUndefined(); // Stale config alias also cleaned by heuristic
    expect(paths["custom-alias"]).toBeDefined(); // Manual user paths untampered (doesn't end with /*)
    expect(paths["@manual/*"]).toBeDefined(); // Untouched (does not start with ./)
    expect(paths["@manual-two/*"]).toBeDefined(); // Untouched (array length !== 1)
  });
});
