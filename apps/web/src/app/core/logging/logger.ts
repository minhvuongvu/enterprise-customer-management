import { inject, Injectable, InjectionToken } from '@angular/core';
import { redactLogFields, redactText } from '@ecm/contracts';
import { AppConfigStore } from '../config/app-config';
import { IS_BROWSER } from '../platform/platform.tokens';
import type { CorrelationId } from './correlation-id';
import { isLogLevelEnabled, type LogLevel } from './log-level';
import { newCorrelationId } from './correlation-id';

export type { LogLevel } from './log-level';

/**
 * Structured client-side logging.
 *
 * Callers depend on `Logger` and nothing else. What happens to an entry -
 * which level reaches a sink, what is redacted, where it goes - is decided
 * here, once, so that no call site can get it wrong (docs/observability.md).
 *
 * An entry travels: call site → `StructuredLogger` (level threshold, then
 * redaction, then the common fields) → every `LogSink`. Redaction happens
 * before the fan-out, so no sink - present or future - sees a raw value.
 *
 * Direct `console` use is banned everywhere else by lint. `ConsoleLogSink` is
 * the single allowed exception.
 */

export interface LogFields {
  readonly correlationId?: CorrelationId;
  readonly [key: string]: unknown;
}

/**
 * Provided in root, so that any injector - a component test's included - can
 * log. With no sink registered (`LOG_SINKS` defaults to none) that logger is
 * silent; the application registers its sinks in `provideObservability()`.
 *
 * A subclass must carry its own `@Injectable()`. Without it, Angular reuses
 * this class's factory for the subclass, and `useClass: MyTestLogger` quietly
 * builds a `StructuredLogger` instead.
 */
@Injectable({ providedIn: 'root', useFactory: () => new StructuredLogger() })
export abstract class Logger {
  abstract debug(message: string, fields?: LogFields): void;
  abstract info(message: string, fields?: LogFields): void;
  abstract warn(message: string, fields?: LogFields): void;
  abstract error(message: string, fields?: LogFields): void;
}

/**
 * One line of the log, as every sink receives it.
 *
 * The field names match the mock API's (`apps/mock-api/src/logging/`), so one
 * query for a correlation id returns both sides' lines.
 */
export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly service: 'web';
  /** Where the code ran: the same code runs in two places. */
  readonly platform: 'browser' | 'server';
  /**
   * One id per page load. Groups everything one tab did without identifying
   * the person - a deliberately anonymous alternative to a user id.
   */
  readonly pageViewId: string;
  readonly [field: string]: unknown;
}

/** Where entries go. Implementations must not throw: logging never breaks the app. */
export interface LogSink {
  write(entry: LogEntry): void;
}

/**
 * Every sink the application writes to. `multi`, so adding one - a collector
 * over HTTP, say - is a provider, not an edit to the logger.
 */
export const LOG_SINKS = new InjectionToken<readonly LogSink[]>('ecm.logSinks', {
  providedIn: 'root',
  factory: () => [],
});

@Injectable()
export class StructuredLogger extends Logger {
  private readonly platform = inject(IS_BROWSER) ? 'browser' : 'server';
  private readonly sinks = inject(LOG_SINKS);
  private readonly config = inject(AppConfigStore).config;
  private readonly pageViewId = newCorrelationId();

  debug(message: string, fields?: LogFields): void {
    this.write('debug', message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.write('info', message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.write('warn', message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.write('error', message, fields);
  }

  private write(level: LogLevel, message: string, fields?: LogFields): void {
    // Read at write time: `config.json` arrives after the logger exists, and
    // a deployment's `logLevel` must apply from then on.
    if (!isLogLevelEnabled(level, this.config().logLevel)) {
      return;
    }

    const entry: LogEntry = {
      ...redactLogFields(fields ?? {}),
      // After the fields, so a caller cannot overwrite them.
      timestamp: new Date().toISOString(),
      level,
      message: redactText(message),
      service: 'web',
      platform: this.platform,
      pageViewId: this.pageViewId,
    };

    for (const sink of this.sinks) {
      try {
        sink.write(entry);
      } catch {
        // A broken sink must not take the others - or the caller - down.
      }
    }
  }
}

/** One JSON object per line: what a browser's console and a collector both read. */
@Injectable()
export class ConsoleLogSink implements LogSink {
  write(entry: LogEntry): void {
    const method = entry.level === 'debug' ? 'log' : entry.level;
    // eslint-disable-next-line no-console -- the one sanctioned console call
    console[method](JSON.stringify(entry));
  }
}
