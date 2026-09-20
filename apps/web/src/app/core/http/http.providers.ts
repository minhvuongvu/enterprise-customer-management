import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { correlationIdInterceptor } from './correlation-id.interceptor';
import { errorMappingInterceptor } from './error-mapping.interceptor';

/**
 * HTTP infrastructure.
 *
 * `withFetch()` because the app is server-rendered: the fetch backend is what
 * Angular's SSR request handling and transfer state are built around.
 *
 * Interceptor order is significant and is the reason this list is not
 * assembled elsewhere:
 *
 *   1. correlationId - stamps the request and publishes the ID on the context
 *   2. errorMapping  - reads that context when classifying a failure
 *
 * Timeout, retry and cancellation policy belong to the data-access layer in
 * Phase 2, not here: they are per-endpoint decisions, and an interceptor that
 * retries everything will happily retry a failed payment.
 */
export function provideAppHttp(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(
      withFetch(),
      withInterceptors([correlationIdInterceptor, errorMappingInterceptor]),
    ),
  ]);
}
