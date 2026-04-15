import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportReconciliation } from '../../src/nits/nits-reporter.js';
import type { ReconciliationResult } from '../../src/types/nits.js';

const makeModule = (name: string) => ({
  id: `mod_${name}`,
  name,
  path: `src/${name}`,
  hash: 'h',
  status: 'active' as const,
  lastSeen: '',
  identifiers: []
});

const makeMoved = (name: string) => ({
  record: makeModule(name),
  oldPath: `src/old_${name}`,
  newPath: `src/${name}`,
  brokenImports: []
});

const emptyResult = (): ReconciliationResult => ({
  confirmed: [],
  moved: [],
  candidates: [],
  stale: [],
  newModules: []
});

describe('reportReconciliation()', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns immediately and logs nothing when total is 0', () => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportReconciliation(emptyResult());
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs confirmed count when there are confirmed modules', () => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = { ...emptyResult(), confirmed: [makeModule('users')] };
    reportReconciliation(result);
    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(output).toContain('Confirmed');
  });

  it('logs new modules count when there are newModules', () => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = { ...emptyResult(), newModules: [makeModule('auth')] };
    reportReconciliation(result);
    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(output).toContain('New modules');
  });

  it('logs moved count when there are moved modules', () => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = { ...emptyResult(), moved: [makeMoved('payments')] };
    reportReconciliation(result);
    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(output).toContain('Moved');
  });

  it('logs stale count when there are stale modules', () => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = { ...emptyResult(), stale: [{ ...makeModule('legacy'), status: 'stale' as const }] };
    reportReconciliation(result);
    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(output).toContain('Stale');
  });

  it('logs separator lines and summary header for any non-empty result', () => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = { ...emptyResult(), newModules: [makeModule('new')] };
    reportReconciliation(result);
    const calls = logSpy.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes('NITS'))).toBe(true);
    expect(calls.some((c: string) => c.includes('---'))).toBe(true);
  });
});
