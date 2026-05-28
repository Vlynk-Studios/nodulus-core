import type { RequestHandler, ErrorRequestHandler } from 'express';
import { getPinoInstance } from './pino-instance.js';
import type { HttpLogger, HttpLoggerOptions } from '../types/index.js';

/**
 * Opt-in HTTP logger hook that returns Express middlewares for request and error logging.
 * It shares the same Pino instance as the rest of the Nodulus application.
 *
 * @example
 * ```ts
 * import { useHttpLogger } from '@vlynk-studios/nodulus-core';
 * 
 * const httpLogger = useHttpLogger({ ignore: ['/health*'] });
 * 
 * // Mount `requests()` early in your Express pipeline
 * app.use(httpLogger.requests());
 * 
 * // ... your routes and Nodulus app here ...
 * 
 * // Mount `errors()` at the very end to catch unhandled exceptions
 * app.use(httpLogger.errors());
 * ```
 * 
 * @param options - Configuration options such as routes to ignore.
 * @returns An object with `requests()` and `errors()` middleware generators.
 */
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
