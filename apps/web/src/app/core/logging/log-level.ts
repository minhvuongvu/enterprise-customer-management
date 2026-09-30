/**
 * Log levels, lowest first.
 *
 * A file of its own because two sides need it: the logger that applies a
 * threshold, and the runtime configuration that sets one. Declared in either,
 * the other would import it back and the two files would form a cycle.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Readonly<Record<LogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };

export const LOG_LEVELS = Object.keys(LEVEL_RANK) as readonly LogLevel[];

export function isLogLevelEnabled(level: LogLevel, threshold: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[threshold];
}
