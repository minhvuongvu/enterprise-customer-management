import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { SKIP_SESSION_REFRESH } from '../auth/session-refresh.context';
import { SessionService } from '../auth/session.service';
import { isAppError } from '../errors/app-error';

/**
 * Turns "the access token expired" into a renewal and one retry, so that a
 * user in the middle of their work never sees it happen.
 *
 * One responsibility: recover from an expired access token. It does not add a
 * credential - the browser attaches the cookie - and it does not decide where
 * the user goes when recovery fails; `SessionService.ended$` does that once,
 * for however many requests failed together.
 *
 * ## The sequence, and the races it handles
 *
 *  1. Record the session generation as the request leaves.
 *  2. On an `authentication` failure, ask `SessionService.renewAfter()`:
 *     - generation unchanged → join the single refresh, or start it. Ten
 *       concurrent 401s produce **one** `POST /auth/refresh`; the other nine
 *       wait on the same observable.
 *     - generation moved → this 401 is about a credential that was replaced
 *       while the request was in flight. Retry without refreshing - a second
 *       refresh would present a rotated token the server has already spent.
 *  3. Retry the original request **once**. A second 401 is the answer, not a
 *     symptom, and goes to the caller: without that rule a server that
 *     rejects the new token would be asked forever.
 *  4. If the refresh fails, the caller receives the **original** failure. It
 *     asked for a customer, not for a refresh, and "your session has ended"
 *     is the true account of what happened to its request.
 *
 * ## What is retried
 *
 * Every method, including writes, and that is safe here for a specific reason:
 * a 401 is decided by `requireAuth` before any handler runs, so a request that
 * received one changed nothing on the server. A retry cannot double-apply it.
 *
 * ## Position in the chain
 *
 * After the logging interceptor, so a request that was renewed and retried is
 * logged once, with its whole duration. Before the CSRF interceptor, so the
 * retry is stamped again from the cookie as it is *now*. Before error mapping,
 * so it reads the taxonomy (`kind === 'authentication'`) rather than a status
 * code. See `http.providers.ts`.
 */
export const authRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_SESSION_REFRESH)) {
    return next(req);
  }

  const session = inject(SessionService);
  const sentAt = session.generation;

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!isAppError(error) || error.kind !== 'authentication') {
        return throwError(() => error);
      }

      return session.renewAfter(sentAt).pipe(
        catchError(() => throwError(() => error)),
        switchMap(() => next(req)),
      );
    }),
  );
};
