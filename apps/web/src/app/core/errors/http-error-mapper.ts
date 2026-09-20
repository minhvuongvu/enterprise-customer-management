import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorBodySchema } from '@ecm/contracts';
import type { ApiErrorBody } from '@ecm/contracts';
import { appError, DEFAULT_ERROR_MESSAGE_KEYS } from './app-error';
import type { AppError } from './app-error';
import type { CorrelationId } from '../logging/correlation-id';

/**
 * The single place where transport failures become application errors.
 *
 * Mapping centrally is what lets every feature handle failure the same way, and
 * is what keeps a backend's raw message from reaching a user.
 *
 * The response body is **validated** against the published envelope rather than
 * trusted. A 422 whose body is an HTML error page from a proxy is a real
 * possibility, and reading `body.error.details.fieldErrors` off it would throw
 * inside the error handler - turning a handled failure into an unhandled one.
 */
export function mapHttpError(response: HttpErrorResponse, correlationId?: CorrelationId): AppError {
  const envelope = readEnvelope(response);
  const base = {
    status: response.status,
    // The server echoes the id it was sent; prefer its value so both sides'
    // logs agree even if something rewrote the header in between.
    correlationId: envelope?.error.correlationId ?? correlationId,
    cause: response,
  };

  // Angular reports a status of 0 when the request never got an HTTP response
  // at all: offline, DNS failure, connection refused, or a CORS rejection.
  if (response.status === 0) {
    return appError('network', base);
  }

  switch (response.status) {
    case 400:
    case 422:
      return {
        kind: 'validation',
        messageKey: DEFAULT_ERROR_MESSAGE_KEYS.validation,
        // Keys are dotted paths (`address.city`), so a form can mark the exact
        // control. Empty when the body was not the envelope we expect.
        fieldErrors: envelope?.error.details?.fieldErrors ?? {},
        ...base,
      };
    case 401:
      return appError('authentication', base);
    case 403:
      return appError('authorization', base);
    case 404:
      return appError('not-found', base);
    case 409:
      return appError('conflict', base);
    case 429:
      return {
        kind: 'rate-limited',
        messageKey: DEFAULT_ERROR_MESSAGE_KEYS['rate-limited'],
        retryAfterSeconds:
          envelope?.error.details?.retryAfterSeconds ??
          parseRetryAfter(response.headers.get('Retry-After')),
        ...base,
      };
    default:
      return appError(response.status >= 500 ? 'server' : 'unknown', base);
  }
}

/** Returns the parsed envelope, or `null` if the body is not one. */
function readEnvelope(response: HttpErrorResponse): ApiErrorBody | null {
  const parsed = apiErrorBodySchema.safeParse(response.error);
  return parsed.success ? parsed.data : null;
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}
