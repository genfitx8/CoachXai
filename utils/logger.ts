/**
 * Central logging utility for CoachX AI.
 *
 * Goals:
 *   - Replace scattered `console.error`/`console.log` calls with a uniform API
 *     that includes a scope (module name) and a structured payload.
 *   - Silence debug/info noise in production builds while preserving warnings
 *     and errors.
 *   - Provide a single seam to plug in remote error reporting (e.g. Sentry,
 *     Datadog) later by swapping the sink, without touching call sites.
 *
 * Usage:
 *   import { createLogger } from '../utils/logger';
 *   const log = createLogger('storage');
 *   log.error('Failed to save lessons', err);
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug: (message: string, ...details: unknown[]) => void;
  info: (message: string, ...details: unknown[]) => void;
  warn: (message: string, ...details: unknown[]) => void;
  error: (message: string, error?: unknown, ...details: unknown[]) => void;
}

export interface LogRecord {
  level: LogLevel;
  scope: string;
  message: string;
  details: unknown[];
  timestamp: number;
}

export type LogSink = (record: LogRecord) => void;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// Vite injects import.meta.env. Tests run with mode='test'; production with 'production'.
// Treat anything non-production as a development build for logging purposes.
function isProduction(): boolean {
  try {
    return import.meta.env?.PROD === true;
  } catch {
    return false;
  }
}

function defaultMinLevel(): LogLevel {
  return isProduction() ? 'warn' : 'debug';
}

let currentMinLevel: LogLevel = defaultMinLevel();

let currentSink: LogSink = (record) => {
  const prefix = `[${record.scope}]`;
  switch (record.level) {
    case 'debug':
    case 'info':
      console.log(prefix, record.message, ...record.details);
      break;
    case 'warn':
      console.warn(prefix, record.message, ...record.details);
      break;
    case 'error':
      console.error(prefix, record.message, ...record.details);
      break;
  }
};

/** Override the minimum level emitted. Mainly for tests / debug toggles. */
export function setLogLevel(level: LogLevel): void {
  currentMinLevel = level;
}

/** Replace the underlying sink (e.g. to forward to a remote service). */
export function setLogSink(sink: LogSink): void {
  currentSink = sink;
}

/** Reset both level and sink to defaults. Used by tests. */
export function resetLogger(): void {
  currentMinLevel = defaultMinLevel();
  currentSink = (record) => {
    const prefix = `[${record.scope}]`;
    switch (record.level) {
      case 'debug':
      case 'info':
        console.log(prefix, record.message, ...record.details);
        break;
      case 'warn':
        console.warn(prefix, record.message, ...record.details);
        break;
      case 'error':
        console.error(prefix, record.message, ...record.details);
        break;
    }
  };
}

function emit(level: LogLevel, scope: string, message: string, details: unknown[]): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[currentMinLevel]) return;
  currentSink({ level, scope, message, details, timestamp: Date.now() });
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, ...details) => emit('debug', scope, message, details),
    info: (message, ...details) => emit('info', scope, message, details),
    warn: (message, ...details) => emit('warn', scope, message, details),
    error: (message, error, ...details) =>
      emit('error', scope, message, error === undefined ? details : [error, ...details]),
  };
}
