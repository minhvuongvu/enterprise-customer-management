import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { isAppError } from '../errors/app-error';
import { Logger } from '../logging/logger';
import { CORRELATION_ID } from './correlation-id.interceptor';

/**
 * Times every request and writes one log line about how it ended.
 *
 * One responsibility: observation. It changes nothing about the request or the
 * response, which is why it can sit near the outside of the chain and see the
 * whole of a request's life - including a renewal and retry, which it records
 * as one request with the total time the caller actually waited.
 *
 * Three outcomes, three levels:
 *
 *  - completed  → debug. Normal traffic is not news.
 *  - failed     → error, with the taxonomy's `kind`, never the server's
 *                 message. Error *mapping* is a different interceptor; this
 *                 one only reports what it produced.
 *  - cancelled  → debug. A superseded search is the store working as
 *                 designed (`switchMap`), not a failure.
 *
 * ## What is not logged
 *
 * The query string. `?search=nguyen%20van%20a` is a customer's name, and a
 * search by email is an email address; ANGULAR_PROJECT_CONTEXT.md 4.14 says
 * logs carry no unnecessary personal data. The path identifies the endpoint,
 * which is what an operator needs. Bodies and headers are never logged, which
 * is what keeps a password and a CSRF token out of every log line.
 */
export const requestLoggingInterceptor: HttpInterceptorFn = (req, next) => {
  const logger = inject(Logger);
  const started = performance.now();

  const fields = () => ({
    method: req.method,
    url: withoutQuery(req.url),
    durationMs: Math.round(performance.now() - started),
    // Set by the correlation-id interceptor, which runs first.
    correlationId: req.context.get(CORRELATION_ID) ?? undefined,
  });

  return next(req).pipe(
    tap({
      next: (event) => {
        if (event instanceof HttpResponse) {
          logger.debug('HTTP request completed', { ...fields(), status: event.status });
        }
      },
      error: (error: unknown) => {
        logger.error('HTTP request failed', {
          ...fields(),
          kind: isAppError(error) ? error.kind : 'unknown',
          status: isAppError(error) ? error.status : undefined,
        });
      },
      unsubscribe: () => logger.debug('HTTP request cancelled', fields()),
    }),
  );
};

function withoutQuery(url: string): string {
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}
