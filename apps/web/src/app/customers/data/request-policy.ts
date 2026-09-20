import { catchError, retry, throwError, timeout, timer, type MonoTypeOperatorFunction } from 'rxjs';
import { appError, isAppError, type AppError } from '../../core/errors/app-error';

/**
 * Timeout and retry, decided per endpoint rather than globally.
 *
 * Phase 0 deliberately kept these out of the interceptor chain, and this file
 * is the other half of that decision. The reason is that the correct policy is
 * a property of *what the request does*, not of the fact that it is a request:
 *
 *  - a read that fails transiently should be tried again, because the user
 *    asked a question and the answer has not changed;
 *  - a write must not, because "the connection dropped" and "the server
 *    handled it and the response was lost" look identical from here, and a
 *    retried create is a duplicate customer.
 *
 * The two operators below are therefore named after the intent, not after the
 * numbers. A caller that reaches for `withWritePolicy` on a GET has said
 * something wrong out loud, which is the point.
 *
 * They live in the customer feature because it is the only caller. When a
 * second feature needs them the file moves to `core/http` - a rename, which is
 * the cheap direction. Inventing the shared location first is the expensive one.
 */

/** A read should not hang a page for longer than this. */
export const READ_TIMEOUT_MS = 10_000;
/** Writes get longer: the server does more, and giving up early is worse. */
export const WRITE_TIMEOUT_MS = 15_000;
/** Attempts after the first. Three tries total is enough for a blip. */
export const READ_RETRY_ATTEMPTS = 2;
/** Base for exponential backoff: 200ms, then 400ms. */
export const RETRY_BASE_DELAY_MS = 200;

/**
 * Timeout, then retry transient failures with backoff.
 *
 * The timeout is inside the retry, so every attempt gets a fresh budget rather
 * than all three sharing one.
 */
export function withReadPolicy<T>(): MonoTypeOperatorFunction<T> {
  return (source) =>
    source.pipe(
      timeout(READ_TIMEOUT_MS),
      catchError((error: unknown) => throwError(() => toAppError(error))),
      retry({
        count: READ_RETRY_ATTEMPTS,
        delay: (error: unknown, attempt) =>
          isTransient(error)
            ? timer(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1))
            : // Rethrowing from `delay` is how RxJS is told to stop retrying.
              // Anything the user could fix - a validation error, a conflict,
              // a permission - must reach them immediately, not three seconds
              // later having been asked twice more.
              throwError(() => error),
      }),
    );
}

/** A timeout, and nothing else. A write is never retried automatically. */
export function withWritePolicy<T>(): MonoTypeOperatorFunction<T> {
  return (source) =>
    source.pipe(
      timeout(WRITE_TIMEOUT_MS),
      catchError((error: unknown) => throwError(() => toAppError(error))),
    );
}

/**
 * Failures that are worth trying again.
 *
 * Nothing in the 4xx family is here. A 409 will conflict again, a 422 will
 * fail validation again, and a 403 will still be forbidden - retrying them
 * only delays the message the user needs.
 */
function isTransient(error: unknown): boolean {
  return isAppError(error) && (error.kind === 'network' || error.kind === 'timeout');
}

/**
 * Normalises whatever the timeout produced.
 *
 * The error-mapping interceptor has already turned transport failures into
 * `AppError`s, but `timeout()` runs *outside* the interceptor chain and throws
 * an RxJS `TimeoutError`. Left alone it would reach a component as a raw
 * object with a stack trace, which rule 6 exists to prevent.
 */
function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }
  if (error instanceof Error && error.name === 'TimeoutError') {
    return appError('timeout', { cause: error });
  }
  return appError('unknown', { cause: error });
}
