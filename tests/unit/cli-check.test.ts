import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectViolations } from '../../src/cli/lib/violations.js';
import { buildModuleGraph, ModuleNode } from '../../src/cli/lib/graph-builder.js';
import { checkCommand } from '../../src/cli/commands/check.js';
import * as configModule from '../../src/core/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('nodulus check', () => {
  const fixturePath = path.resolve(__dirname, '../fixtures/check-app');

  describe('detectViolations() with Fixture', () => {
    it('detects private import in fixture (payments module)', async () => {
      const graph = await buildModuleGraph({ modules: 'src/modules/*' } as any, fixturePath);
      const violations = detectViolations(graph);
      
      const privateImp = violations.find(v => v.type === 'private-import');
      expect(privateImp).toBeDefined();
      expect(privateImp?.module).toBe('payments');
      expect(privateImp?.message).toContain('users.repository.js');
    });

    it('detects undeclared import in fixture (payments module)', async () => {
      const graph = await buildModuleGraph({ modules: 'src/modules/*' } as any, fixturePath);
      const violations = detectViolations(graph);
      
      const undeclaredImp = violations.find(v => v.type === 'undeclared-import');
      expect(undeclaredImp).toBeDefined();
      expect(undeclaredImp?.module).toBe('payments');
      expect(undeclaredImp?.suggestion).toContain('Add "orders" to the imports array');
    });
  });

  describe('detectViolations() with mock nodes', () => {
    it('detects circular dependency A -> B -> A', () => {
      const mockNodes: ModuleNode[] = [
        { name: 'A', dirPath: '/A', indexPath: '/A/index.ts', declaredImports: ['B'], actualImports: [] },
        { name: 'B', dirPath: '/B', indexPath: '/B/index.ts', declaredImports: ['A'], actualImports: [] }
      ];
      const mockGraph = { domains: [], modules: mockNodes };

      const violations = detectViolations(mockGraph);
      const circular = violations.find(v => v.type === 'circular-dependency');
      
      expect(circular).toBeDefined();
      expect(circular?.cycle).toEqual(['A', 'B', 'A']);
    });
  });

  describe('checkCommand action', () => {
    let exitSpy: any;
    let logSpy: any;
    let _errorSpy: any;

    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      _errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(process, 'cwd').mockReturnValue(fixturePath);
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue({
        modules: 'src/modules/*',
        prefix: '',
        aliases: {},
        strict: false
      } as any);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('does not call process.exit(1) if there are no violations', async () => {
      const cmd = checkCommand();
      await cmd.parseAsync(['node', 'test', '--module', 'orders']);
      
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('--strict calls process.exit(1) when there are violations', async () => {
      const cmd = checkCommand();
      await cmd.parseAsync(['node', 'test', '--strict']);
      
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('--format json produces standard JSON structure', async () => {
      const cmd = checkCommand();
      await cmd.parseAsync(['node', 'test', '--format', 'json']);
      
      const logCall = logSpy.mock.calls.find((call: any[]) => typeof call[0] === 'string' && call[0].includes('"modules":'));
      expect(logCall).toBeDefined();
      
      const jsonOutput = JSON.parse(logCall[0]);
      expect(jsonOutput.modules).toBeDefined();
      expect(jsonOutput.domains).toBeDefined();
      expect(jsonOutput.violations).toBeDefined();
      expect(Array.isArray(jsonOutput.violations)).toBe(true);
    });
  });
});
