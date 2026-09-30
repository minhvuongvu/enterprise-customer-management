import { redactLogFields } from '@ecm/contracts';

/**
 * The mock API's structured log.
 *
 * One JSON object per line on stdout - the format every log collector reads -
 * with the same field names as the browser's log (`level`, `message`,
 * `correlationId`, `durationMs`), so a line from each side can be joined on the
 * correlation id without a mapping table (docs/observability.md).
 *
 * Every entry passes through the shared redaction policy in `@ecm/contracts`
 * before it is written *anywhere*, the in-memory buffer included (ADR-0038).
 *
 * The buffer keeps the last entries so a test can ask the running server
 * "what did you log for this correlation id?" through `/api/_mock/logs` - the
 * mock's stand-in for a query against a log aggregator. A real backend ships
 * its lines to one and keeps nothing in memory.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly service: 'mock-api';
  readonly [field: string]: unknown;
}

const LEVEL_RANK: Readonly<Record<LogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface LoggerOptions {
  /** Lowest level written to stdout. The buffer keeps everything. */
  readonly level: LogLevel;
  /** False in the unit tests, which assert on the buffer instead. */
  readonly stdout: boolean;
  readonly bufferSize: number;
}

export class MockApiLogger {
  private readonly buffer: LogEntry[] = [];
  private readonly options: LoggerOptions;

  constructor(options: LoggerOptions) {
    this.options = options;
  }

  debug(message: string, fields: Record<string, unknown> = {}): void {
    this.write('debug', message, fields);
  }

  info(message: string, fields: Record<string, unknown> = {}): void {
    this.write('info', message, fields);
  }

  warn(message: string, fields: Record<string, unknown> = {}): void {
    this.write('warn', message, fields);
  }

  error(message: string, fields: Record<string, unknown> = {}): void {
    this.write('error', message, fields);
  }

  /** Buffered entries, newest last, optionally only one correlation id's. */
  entries(correlationId?: string): readonly LogEntry[] {
    return correlationId
      ? this.buffer.filter((entry) => entry['correlationId'] === correlationId)
      : [...this.buffer];
  }

  private write(level: LogLevel, message: string, fields: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: 'mock-api',
      ...redactLogFields(fields),
    };

    this.buffer.push(entry);
    if (this.buffer.length > this.options.bufferSize) {
      this.buffer.shift();
    }

    if (this.options.stdout && LEVEL_RANK[level] >= LEVEL_RANK[this.options.level]) {
      const line = JSON.stringify(entry);
      if (level === 'error') {
        console.error(line);
      } else {
        console.log(line);
      }
    }
  }
}

export function isLogLevel(value: string | undefined): value is LogLevel {
  return value !== undefined && value in LEVEL_RANK;
}
