import { ErrorHandler, EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideRuntimeConfig } from './config/runtime-config.provider';
import { GlobalErrorHandler } from './errors/global-error-handler';
import { provideAppHttp } from './http/http.providers';
import { provideI18n } from './i18n/i18n.providers';
import { ConsoleLogger, Logger } from './logging/logger';

/**
 * Everything the application needs exactly once.
 *
 * A single entry point rather than a list in `app.config.ts`, so that adding
 * infrastructure does not mean editing the bootstrap file, and so the order
 * dependencies between these providers live next to the code that explains
 * them.
 *
 * `Logger` is bound before the error handler and the HTTP layer because both
 * depend on it.
 */
export function provideCore(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: Logger, useClass: ConsoleLogger },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideAppHttp(),
    provideI18n(),
    provideRuntimeConfig(),
  ]);
}
