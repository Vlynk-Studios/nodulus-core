import { describe, it, expect, vi, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  detectRelativeBoundaryViolations,
  detectViolations,
  ViolationType,
} from '../../src/cli/lib/violations.js';
import { buildModuleGraph } from '../../src/cli/lib/graph-builder.js';
import { checkCommand } from '../../src/cli/commands/check.js';
import * as configModule from '../../src/core/config.js';

function writeModuleIndex(moduleDir: string, name: string): void {
  fs.writeFileSync(
    path.join(moduleDir, 'index.ts'),
    `import { Module } from '@vlynk-studios/nodulus-core';\nModule('${name}', { imports: [] });`,
  );
}

function createBoundaryFixture(
  files: Record<string, string>,
  configContent = "export default { modules: 'src/modules/*', strict: false };",
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-boundary-'));
  const usersDir = path.join(root, 'src', 'modules', 'users');
  const paymentsDir = path.join(root, 'src', 'modules', 'payments');
  fs.mkdirSync(usersDir, { recursive: true });
  fs.mkdirSync(paymentsDir, { recursive: true });
  writeModuleIndex(usersDir, 'users');
  writeModuleIndex(paymentsDir, 'payments');
  fs.writeFileSync(path.join(paymentsDir, 'payments.service.ts'), 'export class PaymentsService {}');
  fs.writeFileSync(path.join(root, 'nodulus.config.js'), configContent);

  for (const [rel, content] of Object.entries(files)) {
    const filePath = path.join(usersDir, rel);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  return root;
}

describe('check — relative boundary violations', () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it('module with no relative cross-module imports → zero RELATIVE_BOUNDARY_VIOLATION', async () => {
    const root = createBoundaryFixture({
      'users.service.ts': "import { R } from './users.repository';",
      'users.repository.ts': 'export class UsersRepository {}',
    });
    roots.push(root);

    const graph = await buildModuleGraph({ modules: 'src/modules/*' } as never, root);
    const violations = detectRelativeBoundaryViolations(graph, root);
    expect(
      violations.filter(v => v.type === ViolationType.RELATIVE_BOUNDARY_VIOLATION),
    ).toHaveLength(0);
  });

  it('one import ../other/other.service → one violation with file, import and hint', async () => {
    const root = createBoundaryFixture({
      'users.service.ts': "import { PaymentsService } from '../payments/payments.service';",
    });
    roots.push(root);

    const graph = await buildModuleGraph({ modules: 'src/modules/*' } as never, root);
    const violations = detectRelativeBoundaryViolations(graph, root);

    expect(violations).toHaveLength(1);
    expect(violations[0].type).toBe(ViolationType.RELATIVE_BOUNDARY_VIOLATION);
    expect(violations[0].module).toBe('users');
    expect(violations[0].import).toBe('../payments/payments.service');
    expect(violations[0].file).toContain('users.service.ts');
    expect(violations[0].hint).toContain('@modules');
  });

  it('three cross-module imports in the same file → three violations', async () => {
    const root = createBoundaryFixture({
      'users.service.ts': [
        "import { P } from '../payments/payments.service';",
        "import { P2 } from '../payments/payments.service';",
        "import { O } from '../orders/orders.service';",
      ].join('\n'),
    });
    roots.push(root);

    const ordersDir = path.join(root, 'src', 'modules', 'orders');
    fs.mkdirSync(ordersDir, { recursive: true });
    writeModuleIndex(ordersDir, 'orders');
    fs.writeFileSync(path.join(ordersDir, 'orders.service.ts'), 'export class OrdersService {}');

    const graph = await buildModuleGraph({ modules: 'src/modules/*' } as never, root);
    const violations = detectRelativeBoundaryViolations(graph, root);

    expect(violations).toHaveLength(3);
    expect(violations.every(v => v.file.includes('users.service.ts'))).toBe(true);
    expect(violations.map(v => v.import).sort()).toEqual(
      ['../orders/orders.service', '../payments/payments.service', '../payments/payments.service'].sort(),
    );
  });

  it('cross-module imports in different files → one violation per import with different file', async () => {
    const root = createBoundaryFixture({
      'users.service.ts': "import { P } from '../payments/payments.service';",
      'users.controller.ts': "import { P } from '../payments/payments.service';",
    });
    roots.push(root);

    const graph = await buildModuleGraph({ modules: 'src/modules/*' } as never, root);
    const violations = detectRelativeBoundaryViolations(graph, root);

    expect(violations).toHaveLength(2);
    const files = violations.map(v => v.file);
    expect(files.some(f => f.includes('users.service.ts'))).toBe(true);
    expect(files.some(f => f.includes('users.controller.ts'))).toBe(true);
    expect(new Set(files).size).toBe(2);
  });

  it('detectViolations includes boundary violations without mixing other types for relative', async () => {
    const root = createBoundaryFixture({
      'users.service.ts': "import { P } from '../payments/payments.service';",
    });
    roots.push(root);

    const graph = await buildModuleGraph({ modules: 'src/modules/*' } as never, root);
    const boundary = detectViolations(graph, root).filter(
      v => v.type === ViolationType.RELATIVE_BOUNDARY_VIOLATION,
    );
    expect(boundary).toHaveLength(1);
  });

  it('RELATIVE_BOUNDARY_VIOLATION fuerza fallo aunque strict: false (check)', async () => {
    const root = createBoundaryFixture({
      'users.service.ts': "import { P } from '../payments/payments.service';",
    });
    roots.push(root);

    vi.spyOn(process, 'cwd').mockReturnValue(root);
    vi.spyOn(configModule, 'loadConfig').mockResolvedValue({
      modules: 'src/modules/*',
      strict: false,
      nits: { enabled: false },
    } as never);

    const originalExitCode = process.exitCode;
    process.exitCode = 0;

    const cmd = checkCommand();
    await expect(cmd.parseAsync(['node', 'test'])).rejects.toThrow(/violations found/i);

    process.exitCode = originalExitCode;
  });

  it('hint mentions the alias @modules/<module>', async () => {
    const root = createBoundaryFixture({
      'users.service.ts': "import { P } from '../payments/payments.service';",
    });
    roots.push(root);

    const graph = await buildModuleGraph({ modules: 'src/modules/*' } as never, root);
    const [violation] = detectRelativeBoundaryViolations(graph, root);

    expect(violation.hint).toMatch(/@modules\/<module>/);
  });
});
