import type { RequestHandler, ErrorRequestHandler } from 'express';
import { getPinoInstance } from './pino-instance.js';
import type { HttpLogger, HttpLoggerOptions } from '../types/index.js';

export function useHttpLogger(options: HttpLoggerOptions = {}): HttpLogger {
  const logger = getPinoInstance().child({ service: 'http' });
  const ignorePatterns = options.ignore ?? [];

  const shouldIgnore = (path: string) => {
    return ignorePatterns.some((pattern) => {
      if (pattern.endsWith('*')) {
        return path.startsWith(pattern.slice(0, -1));
      }
      return path === pattern;
    });
  };

  return {
    requests(): RequestHandler {
      return (req, res, next) => {
        if (shouldIgnore(req.path)) {
          return next();
        }

        const start = Date.now();

        res.on('finish', () => {
          const responseTime = Date.now() - start;
          const status = res.statusCode;
          const msg = `${req.method} ${req.path} ${status}`;

          let level: 'info' | 'warn' | 'error' = 'info';
          if (status >= 400 && status < 500) {
            level = 'warn';
          } else if (status >= 500) {
            level = 'error';
          }

          const meta: Record<string, unknown> = {
            status,
            responseTime,
          };

          // Pino exposes isLevelEnabled, but we can also just log it in debug if options.logBody is true
          if (options.logBody && logger.isLevelEnabled('debug')) {
            meta.body = req.body;
          }

          logger[level](meta, msg);
        });

        next();
      };
    },

    errors(): ErrorRequestHandler {
      // Express requires 4 arguments for error handlers, even if next is unused
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      return (err: any, req, res, next) => {
        const msg = `${req.method} ${req.path}`;
        const status = err.status ?? 500;

        logger.error({ err, status }, `${msg} — ${err.message}`);

        if (!res.headersSent) {
          res.status(status).json({ error: err.message });
        }
      };
    },
  };
}
