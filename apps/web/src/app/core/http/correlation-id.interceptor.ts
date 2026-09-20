import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { newCorrelationId } from '../logging/correlation-id';
import type { CorrelationId } from '../logging/correlation-id';

/** Header the mock API echoes into its own logs (Phase 0.5). */
export const CORRELATION_ID_HEADER = 'X-Correlation-Id';

/**
 * Carries the ID down the interceptor chain.
 *
 * A header would also travel, but the context survives as a typed value the
 * rest of the chain can read without re-parsing headers.
 */
export const CORRELATION_ID = new HttpContextToken<CorrelationId | null>(() => null);

/**
 * Stamps every outgoing request with a fresh correlation ID.
 *
 * Must run before the error-mapping interceptor, otherwise the context this
 * sets is not yet present when an error is mapped. The order is asserted in
 * http.providers.ts.
 */
export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  const correlationId = newCorrelationId();

  return next(
    req.clone({
      setHeaders: { [CORRELATION_ID_HEADER]: correlationId },
      context: req.context.set(CORRELATION_ID, correlationId),
    }),
  );
};
