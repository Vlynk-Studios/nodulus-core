/**
 * NITS Delete Lifecycle — Integration Tests
 *
 * End-to-end tests that exercise the full Move vs Delete detection pipeline
 * using real filesystem operations on isolated temporary directories.
 *
 * The reconciler is invoked directly (no createApp bootstrap) to keep I/O
 * minimal and cycles deterministic.
 *
 * Coverage:
 *  1. Full delete lifecycle — confirmed delete → purge from registry
 *  2. Move detected by Shadow File, NOT by Jaccard
 *  3. Aggressive move (path + name + ~80% identifiers change): ID preserved
 *  4. Accidental delete + Undo — ID purged → newModule in the next cycle
 *  5. Backward compatibility — project without .nodulus: deleted always empty
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  reconcile,
  buildUpdatedNitsRegistry,
} from '../../src/nits/nits-reconciler.js';
import { scanShadowFiles } from '../../src/nits/nits-store.js';
import { computeModuleHash } from '../../src/nits/nits-hash.js';

import type {
  NitsRegistry,
  DiscoveredModule,
} from '../../src/types/nits.js';

// ─── Valid module IDs (exactly /^mod_[0-9a-f]{8}$/) ─────────────────────────
// All characters must be lowercase hex: 0-9 a-f
const ID_PAYMENTS = 'mod_aa000001';
const ID_BILLING  = 'mod_bb000001';
const ID_ORDERS   = 'mod_cc000001';
const ID_USERS    = 'mod_a1b2c3d4'; // same as fixture

// ISO timestamp used in shadow files (must match /^\d{4}-…Z|±HH:MM$/)
const TS = '2026-01-01T00:00:00.000Z';

// ─── File/Path helpers ───────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * Writes a `.nodulus` shadow file that passes `isShadowFileRecord` validation.
 * Required fields: version (number), id (/^mod_[0-9a-f]{8}$/), name, createdAt (ISO).
 */
function writeShadow(moduleDir: string, id: string, name: string): void {
  const record = { version: 1, id, name, createdAt: TS };
  fs.writeFileSync(path.join(moduleDir, '.nodulus'), JSON.stringify(record, null, 2), 'utf8');
}

/** Reads and parses a .nodulus shadow file; returns null if absent. */
function readShadow(moduleDir: string): { id: string } | null {
  const p = path.join(moduleDir, '.nodulus');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

/** Writes a minimal `index.ts` that declares the module. */
function writeIndex(dir: string, moduleName: string): void {
  // Use a relative path that works inside the tmp dir at runtime.
  // For reconciler-only tests we don't import the real framework,
  // so any valid .ts file is enough for computeModuleHash to scan.
  fs.writeFileSync(
    path.join(dir, 'index.ts'),
    `// Module: ${moduleName}\n`,
    'utf8'
  );
}

/** Writes a service file with the given identifiers for Jaccard hashing. */
function writeService(dir: string, filename: string, identifiers: string[]): void {
  const lines = identifiers.map(id => `export class ${id} {}`);
  fs.writeFileSync(path.join(dir, filename), lines.join('\n') + '\n', 'utf8');
}

// ─── Registry helpers ────────────────────────────────────────────────────────



/** Writes `registry.json` to `<cwd>/.nodulus/registry.json`. */
function writeRegistry(cwd: string, reg: NitsRegistry): void {
  const dir = path.join(cwd, '.nodulus');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(reg, null, 2), 'utf8');
}

/** Reads the registry.json written by writeRegistry / runCycle. */
function readRegistry(cwd: string): NitsRegistry {
  return JSON.parse(fs.readFileSync(path.join(cwd, '.nodulus', 'registry.json'), 'utf8'));
}

// ─── Cycle runner ────────────────────────────────────────────────────────────

/**
 * One full reconciliation cycle:
 *  1. Scans shadow files for each moduleDirs entry
 *  2. Computes content hash for each module
 *  3. Reconciles against `previous`
 *  4. Builds updated registry
 *  5. Persists registry.json to disk
 */
async function runCycle(
  moduleDirs: Array<{ name: string; dirPath: string }>,
  previous: NitsRegistry | null,
  cwd: string
) {
  const shadowMap = scanShadowFiles(moduleDirs);

  const discovered: DiscoveredModule[] = [];
  for (const { name, dirPath } of moduleDirs) {
    const { hash, identifiers } = await computeModuleHash(dirPath);
    discovered.push({ name, dirPath, identifiers, hash, shadowFile: shadowMap.get(dirPath) });
  }

  const result   = reconcile(discovered, previous, cwd);
  const registry = buildUpdatedNitsRegistry(result, 'test');
  writeRegistry(cwd, registry);
  return { result, registry };
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

let tmpDirs: string[] = [];

beforeEach(() => { tmpDirs = []; });
afterEach(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  tmpDirs = [];
});

/** Creates an empty isolated tmpdir. */
function mktmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nodulus-delete-lc-'));
  tmpDirs.push(d);
  return d;
}

/** Creates a module directory with an index.ts (and optional shadow file). */
function mkmod(cwd: string, relPath: string, name: string, shadowId?: string): string {
  const dir = path.join(cwd, relPath);
  fs.mkdirSync(dir, { recursive: true });
  writeIndex(dir, name);
  if (shadowId) writeShadow(dir, shadowId, name);
  return dir;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. CICLO COMPLETO DE BORRADO
// ═════════════════════════════════════════════════════════════════════════════

describe('Ciclo completo de borrado', () => {
  it(
    'payments con .nodulus → registry con shadowFileId → ' +
    'desaparece 3 ciclos → deleted → purge → sin trazas',
    async () => {
      const cwd = mktmp();
      const paymentsDir = mkmod(cwd, 'src/modules/payments', 'payments', ID_PAYMENTS);

      // ── Ciclo 0: bootstrap inicial ─────────────────────────────────────────
      const dirs = [{ name: 'payments', dirPath: paymentsDir }];
      const { result: r0, registry: reg0 } = await runCycle(dirs, null, cwd);

      expect(r0.newModules).toHaveLength(1);
      expect(r0.newModules[0].id).toBe(ID_PAYMENTS);
      expect(r0.newModules[0].shadowFileId).toBe(ID_PAYMENTS);
      expect(reg0.modules[ID_PAYMENTS]).toBeDefined();

      // ── Ciclo 1: payments eliminado (missingCount→1, stale) ───────────────
      fs.rmSync(paymentsDir, { recursive: true });
      const { result: r1, registry: reg1 } = await runCycle([], reg0, cwd);

      expect(r1.deleted).toHaveLength(0);
      expect(r1.stale).toHaveLength(1);
      expect(r1.stale[0].id).toBe(ID_PAYMENTS);
      expect(r1.stale[0].missingCount).toBe(1);
      // Still in the registry (grace period)
      expect(reg1.modules[ID_PAYMENTS]).toBeDefined();

      // ── Ciclo 2: sigue ausente (missingCount→2) ───────────────────────────
      const { result: r2, registry: reg2 } = await runCycle([], reg1, cwd);
      expect(r2.deleted).toHaveLength(0);
      expect(r2.stale[0].missingCount).toBe(2);
      expect(reg2.modules[ID_PAYMENTS]).toBeDefined();

      // ── Ciclo 3: missingCount≥3 → confirmed delete → purge ────────────────
      const { result: r3, registry: reg3 } = await runCycle([], reg2, cwd);

      expect(r3.deleted).toHaveLength(1);
      expect(r3.deleted[0].id).toBe(ID_PAYMENTS);
      expect(r3.deleted[0].status).toBe('deleted');
      expect(r3.stale).toHaveLength(0);

      // buildUpdatedNitsRegistry excludes deleted → atomic purge
      expect(reg3.modules[ID_PAYMENTS]).toBeUndefined();
      expect(Object.keys(reg3.modules)).toHaveLength(0);

      // The file on disk also has no traces
      const persisted = readRegistry(cwd);
      expect(persisted.modules[ID_PAYMENTS]).toBeUndefined();
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. MOVE DETECTADO POR SHADOW FILE (no por Jaccard)
// ═════════════════════════════════════════════════════════════════════════════

describe('Move detectado por Shadow File (no por Jaccard)', () => {
  it(
    'users en src/modules/users → mover a auth/users conservando .nodulus → ' +
    'moved con shadowFileId preservado, no stale/deleted',
    async () => {
      const cwd = mktmp();
      const usersDir = mkmod(cwd, 'src/modules/users', 'users', ID_USERS);

      // ── Ciclo 1: bootstrap ────────────────────────────────────────────────
      const { registry: reg1 } = await runCycle(
        [{ name: 'users', dirPath: usersDir }],
        null,
        cwd
      );
      expect(reg1.modules[ID_USERS]).toBeDefined();
      expect(reg1.modules[ID_USERS].shadowFileId).toBe(ID_USERS);

      // ── Ciclo 2: mover carpeta (shadow file se mueve junto) ───────────────
      const usersNewDir = path.join(cwd, 'src/modules/auth/users');
      fs.mkdirSync(path.dirname(usersNewDir), { recursive: true });
      fs.renameSync(usersDir, usersNewDir);

      // The .nodulus file must be at the new location with the same ID
      expect(readShadow(usersNewDir)?.id).toBe(ID_USERS);

      const { result: r2, registry: reg2 } = await runCycle(
        [{ name: 'users', dirPath: usersNewDir }],
        reg1,
        cwd
      );

      // Debe estar en moved, no en stale ni deleted
      expect(r2.moved).toHaveLength(1);
      expect(r2.stale).toHaveLength(0);
      expect(r2.deleted).toHaveLength(0);

      const move = r2.moved[0];
      expect(move.record.id).toBe(ID_USERS);
      expect(move.record.resolvedBy).toBe('shadow-file');
      expect(move.oldPath).toBe('src/modules/users');
      expect(move.newPath).toBe('src/modules/auth/users');

      // ID y shadowFileId preservados en el registry
      expect(reg2.modules[ID_USERS]).toBeDefined();
      expect(reg2.modules[ID_USERS].path).toBe('src/modules/auth/users');
      expect(reg2.modules[ID_USERS].shadowFileId).toBe(ID_USERS);
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. MOVE AGRESIVO: path + nombre + ~80% identifiers cambian, Shadow File intacto
// ═════════════════════════════════════════════════════════════════════════════

describe('Move agresivo — path + nombre + identifiers cambian, Shadow File intacto', () => {
  it(
    'billing renombrado a finance-core con 4/5 clases distintas → ' +
    'detected via shadow-file (resolvedBy=shadow-file), ID preservado',
    async () => {
      const cwd = mktmp();

      // ── Ciclo 1: billing con 5 servicios ──────────────────────────────────
      const billingDir = mkmod(cwd, 'src/modules/billing', 'billing', ID_BILLING);
      // Write original identifiers (InvoiceService + 4 more)
      writeService(billingDir, 'billing.service.ts', [
        'InvoiceService', 'PaymentService', 'SubscriptionService', 'TaxService', 'BillingService',
      ]);

      const { registry: reg1 } = await runCycle(
        [{ name: 'billing', dirPath: billingDir }],
        null,
        cwd
      );
      expect(reg1.modules[ID_BILLING]).toBeDefined();

      // ── Ciclo 2: mover + renombrar + cambiar 4/5 clases ───────────────────
      const financeDir = path.join(cwd, 'src/modules/finance-core');
      fs.mkdirSync(financeDir, { recursive: true });
      writeIndex(financeDir, 'finance-core');
      // Solo InvoiceService sobrevive — los otros 4 son completamente nuevos
      // → Jaccard similarity ≈ 0.17 (muy por debajo del threshold 0.9)
      writeService(financeDir, 'finance.service.ts', [
        'InvoiceService', 'LedgerService', 'AuditService', 'ComplianceService', 'ReportingService',
      ]);
      // Copiar el .nodulus original (mismo ID)
      fs.copyFileSync(
        path.join(billingDir, '.nodulus'),
        path.join(financeDir, '.nodulus')
      );
      // Eliminar la carpeta original
      fs.rmSync(billingDir, { recursive: true });

      const { result: r2, registry: reg2 } = await runCycle(
        [{ name: 'finance-core', dirPath: financeDir }],
        reg1,
        cwd
      );

      // Debe ser moved por shadow-file, sin Jaccard
      expect(r2.moved).toHaveLength(1);
      expect(r2.stale).toHaveLength(0);
      expect(r2.deleted).toHaveLength(0);

      const move = r2.moved[0];
      expect(move.record.id).toBe(ID_BILLING);           // ID preservado
      expect(move.record.resolvedBy).toBe('shadow-file'); // no jaccard
      expect(move.record.name).toBe('finance-core');      // nombre actualizado
      expect(move.oldPath).toBe('src/modules/billing');
      expect(move.newPath).toBe('src/modules/finance-core');

      // Registry preserva el ID con el nuevo nombre
      expect(reg2.modules[ID_BILLING]).toBeDefined();
      expect(reg2.modules[ID_BILLING].name).toBe('finance-core');
      expect(reg2.modules[ID_BILLING].shadowFileId).toBe(ID_BILLING);
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. BORRADO ACCIDENTAL + UNDO
// ═════════════════════════════════════════════════════════════════════════════

describe('Borrado accidental + Undo', () => {
  it(
    'orders: bootstrap → 3 ciclos ausente → purgado → ' +
    'restore with original .nodulus → newModule (no identity recovery)',
    async () => {
      const cwd     = mktmp();
      const ordersDir = mkmod(cwd, 'src/modules/orders', 'orders', ID_ORDERS);
      // Save shadow file content to restore it later
      const shadowBackup = fs.readFileSync(path.join(ordersDir, '.nodulus'), 'utf8');

      // ── Ciclo 0: bootstrap inicial ─────────────────────────────────────────
      const { registry: reg0 } = await runCycle(
        [{ name: 'orders', dirPath: ordersDir }],
        null,
        cwd
      );
      expect(reg0.modules[ID_ORDERS]).toBeDefined();

      // ── Ciclos 1-3: orders eliminado → stale → stale → deleted+purge ───────
      fs.rmSync(ordersDir, { recursive: true });

      const { registry: reg1 } = await runCycle([], reg0, cwd);
      expect(reg1.modules[ID_ORDERS]).toBeDefined(); // grace 1

      const { registry: reg2 } = await runCycle([], reg1, cwd);
      expect(reg2.modules[ID_ORDERS]).toBeDefined(); // grace 2

      const { result: r3, registry: reg3 } = await runCycle([], reg2, cwd);
      expect(r3.deleted).toHaveLength(1);
      expect(r3.deleted[0].id).toBe(ID_ORDERS);
      expect(reg3.modules[ID_ORDERS]).toBeUndefined(); // purgado

      // ── Undo: restaurar carpeta con el .nodulus original ───────────────────
      fs.mkdirSync(ordersDir, { recursive: true });
      writeIndex(ordersDir, 'orders');
      fs.writeFileSync(path.join(ordersDir, '.nodulus'), shadowBackup, 'utf8');

      // ── Cycle 4: reg3 is empty (ID purged) → module is newModule ─────────────────
      const { result: r4, registry: reg4 } = await runCycle(
        [{ name: 'orders', dirPath: ordersDir }],
        reg3,
        cwd
      );

      // El sistema no tiene memoria del ID purgado → newModule
      expect(r4.newModules).toHaveLength(1);
      expect(r4.confirmed).toHaveLength(0);
      expect(r4.moved).toHaveLength(0);
      expect(r4.stale).toHaveLength(0);

      // The shadow file ID is reused as the ID of the new module
      // (Step 0: shadowFile.id not in prev registry → newModule with that ID)
      const restored = r4.newModules[0];
      expect(restored.name).toBe('orders');
      expect(restored.id).toBe(ID_ORDERS); // reutiliza el shadow-file ID

      // El nuevo registro es limpio: no hay missingCount heredado
      expect(reg4.modules[ID_ORDERS]).toBeDefined();
      expect(reg4.modules[ID_ORDERS].status).toBe('active');
      expect(reg4.modules[ID_ORDERS].missingCount).toBeUndefined();
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. BACKWARD COMPATIBILITY — Project with no .nodulus files
// ═════════════════════════════════════════════════════════════════════════════

describe('Backward compatibility: project with no .nodulus files', () => {
  it(
    'no shadow files → full reconciliation, deleted always empty in cycles 1-2, ' +
    'absent module goes to stale; in cycle 3 goes to deleted (standard grace period)',
    async () => {
      const cwd      = mktmp();
      const usersDir = mkmod(cwd, 'src/modules/users-legacy',  'users-legacy');  // sin shadow
      const ordDir   = mkmod(cwd, 'src/modules/orders-legacy', 'orders-legacy'); // sin shadow

      const allDirs = [
        { name: 'users-legacy',  dirPath: usersDir },
        { name: 'orders-legacy', dirPath: ordDir   },
      ];

      // ── Cycle 0: first reconciliation ───────────────────────────────────────────
      const { result: r0, registry: reg0 } = await runCycle(allDirs, null, cwd);

      expect(r0.newModules).toHaveLength(2);
      expect(r0.deleted).toHaveLength(0);
      // Without shadow files, new modules have no shadowFileId
      for (const m of r0.newModules) {
        expect(m.shadowFileId).toBeUndefined();
      }

      // Get dynamically generated IDs

      const orderId = r0.newModules.find(m => m.name === 'orders-legacy')!.id;

      // ── Ciclo 1: orders-legacy desaparece → stale, NO deleted ─────────────
      const { result: r1, registry: reg1 } = await runCycle(
        [{ name: 'users-legacy', dirPath: usersDir }],
        reg0,
        cwd
      );

      expect(r1.deleted).toHaveLength(0);        // nunca deleted sin shadow
      expect(r1.stale).toHaveLength(1);
      expect(r1.stale[0].id).toBe(orderId);
      expect(r1.stale[0].missingCount).toBe(1);
      expect(r1.confirmed).toHaveLength(1);      // users-legacy confirmado por path

      // ── Ciclo 2: sigue ausente → stale missingCount=2 ────────────────────
      const { result: r2, registry: reg2 } = await runCycle(
        [{ name: 'users-legacy', dirPath: usersDir }],
        reg1,
        cwd
      );

      expect(r2.deleted).toHaveLength(0);
      expect(r2.stale).toHaveLength(1);
      expect(r2.stale[0].missingCount).toBe(2);

      // ── Ciclo 3: missingCount≥3 → deleted (igual que con shadow file) ─────
      const { result: r3 } = await runCycle(
        [{ name: 'users-legacy', dirPath: usersDir }],
        reg2,
        cwd
      );

      expect(r3.deleted).toHaveLength(1);
      expect(r3.deleted[0].id).toBe(orderId);
      expect(r3.stale).toHaveLength(0);
    }
  );

  it(
    'all discovered without shadowFile → Steps 1-3 normal, deleted empty, confirmed by path',
    async () => {
      const cwd    = mktmp();
      const modDir = mkmod(cwd, 'src/modules/alpha', 'alpha'); // sin shadow

      const dirs = [{ name: 'alpha', dirPath: modDir }];

      // Primera pasada → newModule
      const { registry: reg0 } = await runCycle(dirs, null, cwd);

      // Second pass (same module, same path) → confirmed by path
      const { result: r1 } = await runCycle(dirs, reg0, cwd);

      expect(r1.confirmed).toHaveLength(1);
      expect(r1.confirmed[0].resolvedBy).toBe('path');
      expect(r1.deleted).toHaveLength(0);
      expect(r1.stale).toHaveLength(0);
    }
  );
});
