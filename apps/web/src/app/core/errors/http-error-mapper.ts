import { HttpErrorResponse } from '@angular/common/http';
import { appError, DEFAULT_ERROR_MESSAGE_KEYS } from './app-error';
import type { AppError } from './app-error';
import type { CorrelationId } from '../logging/correlation-id';

/**
 * The single place where transport failures become application errors.
 *
 * Mapping centrally is what lets every feature handle failure the same way, and
 * is what keeps a backend's raw message from reaching a user.
 */
export function mapHttpError(response: HttpErrorResponse, correlationId?: CorrelationId): AppError {
  const base = { status: response.status, correlationId, cause: response };

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
        // The field-level envelope is defined with the API contract in Phase
        // 0.5. Until it exists, inventing a shape here would be a guess that
        // the real backend then has to match.
        fieldErrors: {},
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
        retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')),
        ...base,
      };
    default:
      return appError(response.status >= 500 ? 'server' : 'unknown', base);
  }
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}
