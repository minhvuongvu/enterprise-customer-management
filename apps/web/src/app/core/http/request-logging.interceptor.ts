import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { isAppError } from '../errors/app-error';
import { Logger } from '../logging/logger';
import { PerformanceMonitor } from '../observability/performance-monitor';
import { CORRELATION_ID } from './correlation-id.interceptor';

/**
 * Times every request and writes one log line about how it ended.
 *
 * One responsibility: observation. It changes nothing about the request or the
 * response, which is why it can sit near the outside of the chain and see the
 * whole of a request's life - including a renewal and retry, which it records
 * as one request with the total time the caller actually waited.
 *
 * Each finished request - completed or failed - is also handed to the
 * `PerformanceMonitor` as an API latency sample. A cancelled one is not: its
 * duration is how long the user waited before moving on, not how long the
 * server took.
 *
 * Three outcomes, three levels:
 *
 *  - completed  → debug. Normal traffic is not news.
 *  - failed     → with the taxonomy's `kind`, never the server's message:
 *                 `error` for a server failure, network loss, timeout or an
 *                 unclassified failure; `warn` for an answer the application
 *                 expects and handles (401, 403, 404, 409, 422, 429). Error
 *                 *mapping* is a different interceptor; this one only reports
 *                 what it produced.
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
/** Failures no feature expects: these, and only these, are logged as `error`. */
const UNEXPECTED_KINDS: ReadonlySet<string> = new Set(['server', 'network', 'timeout', 'unknown']);

export const requestLoggingInterceptor: HttpInterceptorFn = (req, next) => {
  const logger = inject(Logger);
  const monitor = inject(PerformanceMonitor);
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
          const logged = fields();
          logger.debug('HTTP request completed', { ...logged, status: event.status });
          monitor.recordApiCall(req.method, req.url, logged.durationMs, event.status);
        }
      },
      error: (error: unknown) => {
        const logged = fields();
        const kind = isAppError(error) ? error.kind : 'unknown';
        const status = isAppError(error) ? error.status : undefined;
        // A 404, a 409, a refused permission is the API answering as designed,
        // and the feature that asked handles it: `warn`. `error` is kept for
        // what nobody handles well - the server failing, or no answer at all -
        // so that an alert on `error` means something.
        const level = UNEXPECTED_KINDS.has(kind) ? 'error' : 'warn';
        logger[level]('HTTP request failed', { ...logged, kind, status });
        // A failure's latency counts too: a timeout is the slowest call there is.
        monitor.recordApiCall(req.method, req.url, logged.durationMs, status ?? 0);
      },
      unsubscribe: () => logger.debug('HTTP request cancelled', fields()),
    }),
  );
};

function withoutQuery(url: string): string {
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}
