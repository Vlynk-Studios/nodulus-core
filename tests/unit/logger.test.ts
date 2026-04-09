import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger, resolveLogLevel, defaultLogHandler } from '../../src/core/logger.js';
import type { LogHandler } from '../../src/types/index.js';

describe('Logger Utility', () => {
  describe('createLogger', () => {
    it('should filter messages below the minimum level', () => {
      const handler = vi.fn() as unknown as LogHandler;
      const log = createLogger(handler, 'warn');

      log.debug('debug message');
      log.info('info message');
      log.warn('warn message');
      log.error('error message');

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith('warn', 'warn message', undefined);
      expect(handler).toHaveBeenCalledWith('error', 'error message', undefined);
    });

    it('should pass meta data correctly', () => {
      const handler = vi.fn() as unknown as LogHandler;
      const log = createLogger(handler, 'debug');
      const meta = { foo: 'bar' };

      log.info('test', meta);

      expect(handler).toHaveBeenCalledWith('info', 'test', meta);
    });
  });

  describe('resolveLogLevel', () => {
    const originalEnv = process.env.NODE_DEBUG;

    beforeEach(() => {
      process.env.NODE_DEBUG = originalEnv;
    });

    it('should return explicit level if provided', () => {
      expect(resolveLogLevel('error')).toBe('error');
    });

    it('should return debug if NODE_DEBUG includes nodulus', () => {
      process.env.NODE_DEBUG = 'other,nodulus,more';
      expect(resolveLogLevel()).toBe('debug');
    });

    it('should return info by default', () => {
      process.env.NODE_DEBUG = '';
      expect(resolveLogLevel()).toBe('info');
    });
  });

  describe('defaultLogHandler', () => {
    it('should prefix and write messages correctly', () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      defaultLogHandler('info', 'hello world');
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('hello world\n'));
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('[Nodulus]'));

      defaultLogHandler('warn', 'warning');
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('warning\n'));
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[Nodulus]'));

      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    });
  });
});
