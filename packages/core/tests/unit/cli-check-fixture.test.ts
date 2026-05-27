import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCommand } from '../../src/cli/commands/check.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('cli-check-fixture integration', () => {
  const fixturePath = path.resolve(__dirname, '../fixtures/check-app');

  it('runs check command on check-app without violations', async () => {

    vi.spyOn(process, 'cwd').mockReturnValue(fixturePath);
    
    try {
      const cmd = checkCommand();
      // Should resolve without throwing error, even with --strict, because check-app has NO violations
      await expect(cmd.parseAsync(['node', 'test', '--strict'])).resolves.not.toThrow();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
