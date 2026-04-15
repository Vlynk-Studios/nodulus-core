import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportReconciliation } from '../../src/nits/nits-reporter.js';
import type { ReconciliationResult } from '../../src/types/nits.js';
import type { Logger } from '../../src/core/logger.js';

// Mock picocolors to return strings as-is to simplify assertions
vi.mock('picocolors', () => {
  const identity = (s: any) => s;
  const pcMock = {
    bold: identity,
    gray: identity,
    cyan: identity,
    yellow: identity,
    red: identity,
    green: identity,
    magenta: identity,
    white: identity,
    blue: identity,
  };
  return {
    ...pcMock,
    default: pcMock,
  };
});

const makeModule = (name: string) => ({
  id: `mod_${name}`,
  name,
  path: `src/${name}`,
  hash: 'h',
  status: 'active' as const,
  lastSeen: '',
  identifiers: []
});

const emptyResult = (): ReconciliationResult => ({
  confirmed: [],
  moved: [],
  candidates: [],
  stale: [],
  newModules: []
});

describe('reportReconciliation()', () => {
  const createMockLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as unknown as Logger);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no imprime nada (solo debug) si no hay cambios significativos', () => {
    const log = createMockLogger();
    const result = { ...emptyResult(), confirmed: [makeModule('users')] };
    
    reportReconciliation(result, log);
    
    expect(log.warn).not.toHaveBeenCalled();
    expect((log.debug as any).mock.calls[0][0]).toContain('Sin cambios detectados');
  });

  it('reporta movimientos detallados en español', () => {
    const log = createMockLogger();
    const result = { 
      ...emptyResult(), 
      moved: [{
        record: makeModule('users'),
        oldPath: 'src/modules/users',
        newPath: 'src/domains/workspace/modules/users',
        brokenImports: [
          { file: 'src/app.ts', line: 14, specifier: '@modules/users' }
        ]
      }] 
    };
    
    reportReconciliation(result, log);
    
    const warnOutput = (log.warn as any).mock.calls[0][0];
    expect(warnOutput).toMatch(/Movimiento detectado: 'users'/);
    expect(warnOutput).toMatch(/\s{11}Antes: src\/modules\/users/);
    expect(warnOutput).toMatch(/\s{11}Ahora: src\/domains\/workspace\/modules\/users/);
    expect(warnOutput).toMatch(/\s{11}Imports rotos \(1 archivo\(s\)\):/);
    expect(warnOutput).toMatch(/\s{13}src\/app\.ts:14\s{2}→\s{2}@modules\/users/);
    expect(warnOutput).toMatch(/\s{11}Actualizá los imports a: @workspace\/users/);
  });

  it('reporta módulos stale (desaparecidos)', () => {
    const log = createMockLogger();
    const result = { 
      ...emptyResult(), 
      stale: [makeModule('payments')] 
    };
    
    reportReconciliation(result, log);
    
    const warnOutput = (log.warn as any).mock.calls[0][0];
    expect(warnOutput).toMatch(/Módulo 'payments' no encontrado en disco/);
    expect(warnOutput).toMatch(/\s{11}Última ubicación: src\/payments/);
    expect(warnOutput).toMatch(/\s{11}Si fue.*podés ignorar esto/);
  });

  it('reporta candidatos (posibles reubicaciones)', () => {
    const log = createMockLogger();
    const result = { 
      ...emptyResult(), 
      candidates: [{
        record: makeModule('orders'),
        oldPath: '?',
        newPath: 'src/domains/billing/modules/orders',
        brokenImports: []
      }] 
    };
    
    reportReconciliation(result, log);
    
    const warnOutput = (log.warn as any).mock.calls[0][0];
    expect(warnOutput).toMatch(/Posible reubicación: 'orders'/);
    expect(warnOutput).toMatch(/\s{11}Se encontró un módulo con el mismo nombre/);
    expect(warnOutput).toMatch(/\s{11}Nuevo path: src\/domains\/billing\/modules\/orders/);
  });

  it('loguea nuevos módulos solo en nivel debug', () => {
    const log = createMockLogger();
    const result = { ...emptyResult(), newModules: [makeModule('new')] };
    
    reportReconciliation(result, log);
    
    expect(log.warn).not.toHaveBeenCalled();
    const debugCalls = (log.debug as any).mock.calls.map((c: any[]) => c[0]);
    expect(debugCalls.some((c: string) => c.includes('1 nuevos módulos descubiertos'))).toBe(true);
  });

  it('incluye resumen de reconciliación en debug', () => {
    const log = createMockLogger();
    const result = { ...emptyResult(), moved: [{ record: makeModule('m'), oldPath: 'o', newPath: 'n', brokenImports: [] }] };
    
    reportReconciliation(result, log);
    
    const debugCalls = (log.debug as any).mock.calls.map((c: any[]) => c[0]);
    expect(debugCalls.some((c: string) => c.includes('Identity Reconciliation Summary'))).toBe(true);
    expect(debugCalls.some((c: string) => /Moved:\s{10}1/.test(c))).toBe(true);
  });
});
