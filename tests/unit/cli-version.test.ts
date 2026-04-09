import { describe, it, expect, vi, afterEach } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("CLI: Version Flag", () => {
  it("nodulus --version outputs the version from package.json", () => {
    // Read the actual valid version from the package.json to test against
    const pkgPath = path.resolve(__dirname, "../../package.json");
    const pkgJSON = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const expectedVersion = pkgJSON.version;

    const cliPath = path.resolve(__dirname, "../../src/cli/index.ts");
    
    // Execute CLI passing the --version flag
    // We execute with ts-node since the CLI index inside src/ is written in Typescript
    const output = execSync(`npx tsx "${cliPath}" --version`, { encoding: "utf8" }).trim();
    
    expect(output).toBe(expectedVersion);
  });
});
