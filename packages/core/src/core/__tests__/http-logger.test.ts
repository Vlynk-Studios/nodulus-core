import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useHttpLogger } from '../http-logger.js';
import * as pinoInstance from '../pino-instance.js';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../pino-instance.js', () => ({
  getPinoInstance: vi.fn(),
}));

describe('useHttpLogger', () => {
  let mockLogger: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      child: vi.fn().mockReturnThis(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      isLevelEnabled: vi.fn().mockReturnValue(false),
    };

    vi.mocked(pinoInstance.getPinoInstance).mockReturnValue(mockLogger as any);
  });

  const createMockReq = (overrides = {}) => ({
    method: 'GET',
    path: '/users',
    ...overrides,
  } as Request);

  const createMockRes = (overrides = {}) => {
    const res: any = {
      statusCode: 200,
      headersSent: false,
      on: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      ...overrides,
    };
    return res as Response;
  };

  const createMockNext = () => vi.fn() as NextFunction;

  // Helper to simulate the response 'finish' event
  const triggerFinish = (res: any) => {
    const onCall = res.on.mock.calls.find((call: any[]) => call[0] === 'finish');
    if (onCall) onCall[1]();
  };

  it('useHttpLogger() without options does not throw', () => {
    expect(() => useHttpLogger()).not.toThrow();
  });

  describe('requests()', () => {
    it('logs method, path, status and responseTime', () => {
      const logger = useHttpLogger();
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);
      
      expect(next).toHaveBeenCalled();
      
      triggerFinish(res);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 200,
          responseTime: expect.any(Number),
        }),
        'GET /users 200'
      );
    });

    it('uses warn level for 4xx', () => {
      const logger = useHttpLogger();
      const req = createMockReq();
      const res = createMockRes({ statusCode: 404 });
      const next = createMockNext();

      logger.requests()(req, res, next);
      triggerFinish(res);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ status: 404 }),
        'GET /users 404'
      );
    });

    it('uses error level for 5xx', () => {
      const logger = useHttpLogger();
      const req = createMockReq();
      const res = createMockRes({ statusCode: 500 });
      const next = createMockNext();

      logger.requests()(req, res, next);
      triggerFinish(res);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ status: 500 }),
        'GET /users 500'
      );
    });

    it('ignores exact routes in ignore list', () => {
      const logger = useHttpLogger({ ignore: ['/health'] });
      const req = createMockReq({ path: '/health' });
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.on).not.toHaveBeenCalled(); // Hook shouldn't be added
    });

    it('ignores simple glob routes in ignore list', () => {
      const logger = useHttpLogger({ ignore: ['/health*'] });
      const req = createMockReq({ path: '/health/check' });
      const res = createMockRes();
      const next = createMockNext();

      logger.requests()(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.on).not.toHaveBeenCalled();
    });
  });

  describe('errors()', () => {
    it('logs error with stack', () => {
      const logger = useHttpLogger();
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();
      const err = new Error('Database connection failed');

      logger.errors()(err, req, res, next);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: err,
          status: 500,
        }),
        'GET /users — Database connection failed'
      );
    });

    it('responds with correct status from error or 500 by default', () => {
      const logger = useHttpLogger();
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();
      
      const customErr: any = new Error('Not found');
      customErr.status = 404;

      logger.errors()(customErr, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
    });

    it('serializes error using pino err field', () => {
      const logger = useHttpLogger();
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();
      const err = new Error('Test error');

      logger.errors()(err, req, res, next);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: err,
        }),
        expect.any(String)
      );
    });
  });
});
