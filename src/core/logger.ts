import pc from 'picocolors';
import type { LogLevel, LogHandler } from '../types/index.js';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
};

const LEVEL_STYLE: Record<LogLevel, (msg: string) => string> = {
  debug: (msg) => pc.gray(msg),
  info:  (msg) => pc.cyan(msg),
  warn:  (msg) => pc.yellow(msg),
  error: (msg) => pc.red(msg),
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'debug',
  info:  'info ', // trailing space for alignment
  warn:  'warn ',
  error: 'error',
};

/**
 * Default log handler. Writes to process.stdout (info/debug) or process.stderr (warn/error).
 * All lines are prefixed with [Nodulus].
 */
export const defaultLogHandler: LogHandler = (level, message) => {
  const prefix = pc.gray('[Nodulus]');
  const label = LEVEL_STYLE[level](LEVEL_LABELS[level]);
  const line = `${prefix} ${label} ${message}`;
  
  if (level === 'warn' || level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
};

/**
 * Resolves the effective minimum log level.
 * Priority: explicit logLevel option > NODE_DEBUG env var > default ('info').
 */
export function resolveLogLevel(explicit?: LogLevel): LogLevel {
  if (explicit) return explicit;

  const nodeDebug = process.env.NODE_DEBUG ?? '';
  if (nodeDebug.split(',').map(s => s.trim()).includes('nodulus')) {
    return 'debug';
  }

  return 'info';
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message:  string, meta?: Record<string, unknown>): void;
  warn(message:  string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Creates a bound logger that filters by minLevel and delegates to handler.
 * 
 * @param handler  - Where log events are sent.
 * @param minLevel - Events below this level are discarded.
 */
export function createLogger(handler: LogHandler, minLevel: LogLevel): Logger {
  const minOrder = LEVEL_ORDER[minLevel];

  const emit = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (LEVEL_ORDER[level] >= minOrder) {
      handler(level, message, meta);
    }
  };

  return {
    debug: (msg, meta) => emit('debug', msg, meta),
    info:  (msg, meta) => emit('info',  msg, meta),
    warn:  (msg, meta) => emit('warn',  msg, meta),
    error: (msg, meta) => emit('error', msg, meta),
  };
}
