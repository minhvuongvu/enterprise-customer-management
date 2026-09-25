import { HttpBackend, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { authRefreshInterceptor } from './auth-refresh.interceptor';
import { correlationIdInterceptor } from './correlation-id.interceptor';
import { csrfInterceptor } from './csrf.interceptor';
import { errorMappingInterceptor } from './error-mapping.interceptor';
import { requestLoggingInterceptor } from './request-logging.interceptor';
import { UploadAwareBackend } from './upload-aware.backend';

/**
 * HTTP infrastructure.
 *
 * `withFetch()` because the app is server-rendered: the fetch backend is what
 * Angular's SSR request handling and transfer state are built around.
 *
 * ## The interceptor chain
 *
 * Each interceptor has one responsibility, and the order is load-bearing. A
 * request travels down this list and its response travels back up it, so an
 * interceptor sees everything *below* it in both directions:
 *
 *   1. correlationId  - stamps the request and puts the id on the context.
 *                       First, so every other interceptor can read it.
 *   2. requestLogging - times the request and logs how it ended. Above the
 *                       refresh interceptor, so a request that was renewed
 *                       and retried is one log line with its real duration.
 *   3. authRefresh    - on an expired session: one shared refresh, then one
 *                       retry. Above csrf, so the retry passes through it
 *                       again; below logging, so the retry is not a second
 *                       request in the log.
 *   4. csrf           - echoes the CSRF cookie on unsafe, same-origin requests.
 *   5. errorMapping   - turns `HttpErrorResponse` into the `AppError` taxonomy.
 *                       Last, so everything above it - refresh included -
 *                       reasons about kinds, never about status codes.
 *
 * ## The transport
 *
 * `fetch`, except for a request that asks for upload progress, which goes
 * through XHR - `fetch` has no upload progress. `UploadAwareBackend`, ADR-0021.
 *
 * There is no "auth header" interceptor, and that is not an omission: the
 * credential is an `HttpOnly` cookie the browser attaches by itself (ADR-0016).
 *
 * Timeout, retry and cancellation policy are deliberately absent. They belong
 * to the data-access layer - `customers/data/request-policy.ts` sets them per
 * endpoint - because an interceptor that retries everything will happily
 * retry a failed payment. The refresh interceptor's single retry is the one
 * exception, and its safety argument is written down where it is made.
 */
export function provideAppHttp(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(
      withFetch(),
      withInterceptors([
        correlationIdInterceptor,
        requestLoggingInterceptor,
        authRefreshInterceptor,
        csrfInterceptor,
        errorMappingInterceptor,
      ]),
    ),
    // After provideHttpClient(), so it replaces the backend withFetch() chose.
    // Uploads that report progress go through XHR; everything else is fetch.
    UploadAwareBackend,
    { provide: HttpBackend, useExisting: UploadAwareBackend },
  ]);
}
