import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { provideAppHttp } from '../http/http.providers';
import { Logger, type LogFields } from '../logging/logger';

/**
 * The application's real HTTP stack, with a fake transport underneath it.
 *
 * Test-only. Nothing in the application imports this file.
 *
 * The distinction matters: a test that used a bare `provideHttpClient()` would
 * exercise a request path that does not exist in production - no correlation
 * id, no CSRF header, and, most misleadingly, **no error mapping**, so a 403
 * would arrive as an `HttpErrorResponse` and every assertion about error
 * handling would be testing the test's own plumbing. Using the same providers
 * the application boots with is what makes "a 403 becomes an authorization
 * error" a fact about the application rather than about the spec.
 */
export function provideTestHttp(): (Provider | EnvironmentProviders)[] {
  return [
    { provide: Logger, useClass: SilentLogger },
    provideAppHttp(),
    // After `provideAppHttp()`: it replaces the backend while keeping the
    // interceptor chain that was just configured.
    provideHttpClientTesting(),
  ];
}

/**
 * Swallows log output.
 *
 * The error-mapping interceptor logs every failure, and a suite that
 * deliberately provokes failures would otherwise print a wall of them and hide
 * the one line that matters.
 */
export class SilentLogger extends Logger {
  readonly entries: { level: string; message: string; fields?: LogFields }[] = [];

  debug(message: string, fields?: LogFields): void {
    this.entries.push({ level: 'debug', message, fields });
  }
  info(message: string, fields?: LogFields): void {
    this.entries.push({ level: 'info', message, fields });
  }
  warn(message: string, fields?: LogFields): void {
    this.entries.push({ level: 'warn', message, fields });
  }
  error(message: string, fields?: LogFields): void {
    this.entries.push({ level: 'error', message, fields });
  }
}
