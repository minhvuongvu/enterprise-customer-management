import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { correlationIdInterceptor } from './correlation-id.interceptor';
import { csrfInterceptor } from './csrf.interceptor';
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
 *   2. csrf          - echoes the CSRF cookie on unsafe, same-origin requests
 *   3. errorMapping  - reads that context when classifying a failure
 *
 * Error mapping stays last so that a failure caused by anything the earlier
 * interceptors did is still classified. The first two are independent of each
 * other; their relative order is not load-bearing and is alphabetical.
 *
 * Timeout, retry and cancellation policy are deliberately absent. They belong
 * to the data-access layer - Phase 2 implements them per endpoint in
 * `customers/data/request-policy.ts` - because an interceptor that retries
 * everything will happily retry a failed payment, and one that times out
 * everything will cut off a file upload.
 */
export function provideAppHttp(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(
      withFetch(),
      withInterceptors([correlationIdInterceptor, csrfInterceptor, errorMappingInterceptor]),
    ),
  ]);
}
