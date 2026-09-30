import { ErrorHandler, EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideSessionCrossTab } from './auth/session-cross-tab';
import { provideSessionExpiryRedirect } from './auth/session-expiry';
import { provideRuntimeConfig } from './config/runtime-config.provider';
import { GlobalErrorHandler } from './errors/global-error-handler';
import { provideAppHttp } from './http/http.providers';
import { provideI18n } from './i18n/i18n.providers';
import { provideObservability } from './observability/observability.providers';
import { provideDocumentLanguage } from './seo/document-language';

/**
 * Everything the application needs exactly once.
 *
 * A single entry point rather than a list in `app.config.ts`, so that adding
 * infrastructure does not mean editing the bootstrap file, and so the order
 * dependencies between these providers live next to the code that explains
 * them.
 *
 * Observability comes first: the error handler and the HTTP layer both log,
 * and the log's sinks are registered there.
 */
export function provideCore(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideObservability(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideAppHttp(),
    provideI18n(),
    // After provideI18n(): it subscribes to the translation service.
    provideDocumentLanguage(),
    provideRuntimeConfig(),
    // Needs the router, which app.config provides alongside this; environment
    // initializers run once the whole injector exists.
    provideSessionExpiryRedirect(),
    provideSessionCrossTab(),
  ]);
}
