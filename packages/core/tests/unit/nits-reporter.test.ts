import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportReconciliation } from '../../src/nits/nits-reporter.js';
import type { ReconciliationResult } from '../../src/types/nits.js';
import type { Logger } from '../../src/core/logger.js';

const { pcMock } = vi.hoisted(() => {
  const pcMock = {
    bold: (s: any) => s,
    gray: (s: any) => s,
    cyan: (s: any) => s,
    yellow: (s: any) => s,
    red: (s: any) => s,
    green: (s: any) => s,
    magenta: (s: any) => s,
    white: (s: any) => s,
    blue: (s: any) => s,
  };
  return { pcMock };
});

vi.mock('picocolors', () => ({
  ...pcMock,
  default: pcMock
}));

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

  it('returns immediately and logs nothing when total is 0', () => {
    const log = createMockLogger();
    reportReconciliation(emptyResult(), log);
    expect(log.debug).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('logs confirmed count in debug level', () => {
    const log = createMockLogger();
    const result = { ...emptyResult(), confirmed: [makeModule('users')] };
    reportReconciliation(result, log);
    const output = (log.debug as any).mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(output).toContain('Confirmed');
  });

  it('logs detailed movement using warn level', () => {
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
    // console.log('DEBUG WARN OUTPUT:', JSON.stringify(warnOutput));
    
    expect(warnOutput).toMatch(/Move detected/);
    expect(warnOutput).toMatch(/users/);
    expect(warnOutput).toMatch(/src\/modules\/users/);
    expect(warnOutput).toMatch(/src\/domains\/workspace\/modules\/users/);
    expect(warnOutput).toMatch(/Broken imports/);
    expect(warnOutput).toMatch(/src\/app\.ts:14/);
    expect(warnOutput).toMatch(/@modules\/users/);
  });

  it('logs summary at the end in debug level', () => {
    const log = createMockLogger();
    const result = { ...emptyResult(), newModules: [makeModule('new')] };
    reportReconciliation(result, log);
    const calls = (log.debug as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes('NITS'))).toBe(true);
    expect(calls.some((c: string) => c.includes('---'))).toBe(true);
  });
});
