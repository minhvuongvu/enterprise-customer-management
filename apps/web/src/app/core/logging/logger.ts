import { inject, Injectable } from '@angular/core';
import { IS_BROWSER } from '../platform/platform.tokens';
import type { CorrelationId } from './correlation-id';

/**
 * Structured client-side logging seam.
 *
 * Phase 0 ships the abstraction and one console implementation. Phase 7 adds
 * shipping logs somewhere and measuring things; nothing outside this folder
 * should have to change when it does, because callers depend on `Logger` and
 * never on the console.
 *
 * Direct `console` use is banned everywhere else by lint. This file is the
 * single allowed exception.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  readonly correlationId?: CorrelationId;
  readonly [key: string]: unknown;
}

export abstract class Logger {
  abstract debug(message: string, fields?: LogFields): void;
  abstract info(message: string, fields?: LogFields): void;
  abstract warn(message: string, fields?: LogFields): void;
  abstract error(message: string, fields?: LogFields): void;
}

/**
 * Field names whose values must never reach a log sink.
 *
 * Matched as case-insensitive substrings, so `accessToken`, `refresh_token`
 * and `Authorization` are all covered by three entries.
 */
const REDACTED_KEY_PARTS = ['password', 'token', 'secret', 'authorization', 'apikey', 'cookie'];

const REDACTED = '[redacted]';
const MAX_DEPTH = 4;

function isSensitive(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, '');
  return REDACTED_KEY_PARTS.some((part) => normalized.includes(part));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Strips sensitive values before anything is written.
 *
 * Redaction lives at the logger rather than at each call site, because the call
 * site is exactly where someone forgets.
 */
export function redact(fields: LogFields, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (isSensitive(key)) {
      out[key] = REDACTED;
    } else if (isPlainObject(value)) {
      out[key] = depth >= MAX_DEPTH ? REDACTED : redact(value as LogFields, depth + 1);
    } else {
      out[key] = value;
    }
  }
  return out;
}

@Injectable()
export class ConsoleLogger extends Logger {
  private readonly isBrowser = inject(IS_BROWSER);

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
    const entry = {
      level,
      message,
      // The renderer is part of the log: the same code runs in two places and
      // "works in the browser, fails during prerender" is a real failure mode.
      platform: this.isBrowser ? 'browser' : 'server',
      ...redact(fields ?? {}),
    };

    // eslint-disable-next-line no-console -- the one sanctioned console call
    console[level === 'debug' ? 'log' : level](JSON.stringify(entry));
  }
}
