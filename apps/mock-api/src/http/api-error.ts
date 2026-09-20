import { API_ERROR_STATUS } from '@ecm/contracts';
import type { ApiErrorCode, ApiErrorDetails } from '@ecm/contracts';

/**
 * The only way this server reports a failure.
 *
 * Route handlers throw one of these; a single error middleware turns it into
 * the envelope. Handlers therefore never build a response body by hand, which
 * is what keeps every error the same shape - including the ones nobody
 * remembered to think about.
 *
 * The `message` is for developers and logs. It is sent, and the client is
 * contractually forbidden from rendering it.
 */
export class ApiError extends Error {
  // Declared and assigned explicitly rather than as constructor parameter
  // properties: Node runs this file by stripping types, and that mode cannot
  // emit the assignments a parameter property implies. See ADR-0007.
  readonly code: ApiErrorCode;
  readonly details?: ApiErrorDetails;

  constructor(code: ApiErrorCode, message: string, details?: ApiErrorDetails) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return API_ERROR_STATUS[this.code];
  }
}

export const badRequest = (message: string): ApiError => new ApiError('BAD_REQUEST', message);

export const unauthenticated = (message = 'Authentication required.'): ApiError =>
  new ApiError('UNAUTHENTICATED', message);

export const forbidden = (message: string): ApiError => new ApiError('FORBIDDEN', message);

export const notFound = (what: string): ApiError => new ApiError('NOT_FOUND', `${what} not found.`);

export const conflict = (message: string, currentVersion?: number): ApiError =>
  new ApiError('CONFLICT', message, currentVersion === undefined ? undefined : { currentVersion });

export const rateLimited = (retryAfterSeconds: number): ApiError =>
  new ApiError('RATE_LIMITED', 'Too many requests.', { retryAfterSeconds });

export const internalError = (message: string): ApiError => new ApiError('INTERNAL_ERROR', message);
