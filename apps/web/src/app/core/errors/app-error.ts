import type { CorrelationId } from '../logging/correlation-id';

/**
 * The application's error taxonomy (see ANGULAR_PROJECT_CONTEXT.md 4.7).
 *
 * Everything that can go wrong is narrowed into one of these kinds at the
 * boundary it enters through, so feature code never branches on an HTTP status
 * or on the shape of a thrown value. A discriminated union rather than an error
 * class hierarchy: exhaustiveness is then checked by the compiler, and these
 * values cross the SSR boundary and land in logs as plain data.
 *
 * `messageKey` is a translation key, never a sentence. Two rules meet here:
 * user-facing text goes through i18n, and raw backend messages are never shown.
 */

export type AppErrorKind =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'not-found'
  | 'conflict'
  | 'rate-limited'
  | 'server'
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'unknown';

interface AppErrorBase {
  /** Translation key for the message shown to the user. */
  readonly messageKey: string;
  /** HTTP status, when the error came from a response. */
  readonly status?: number;
  /** Ties this error to the request that produced it. */
  readonly correlationId?: CorrelationId;
  /** The original value. For logs and debugging only - never rendered. */
  readonly cause?: unknown;
}

export interface ValidationError extends AppErrorBase {
  readonly kind: 'validation';
  /** Field name to translation keys. Empty until the API envelope exists. */
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
}

export interface RateLimitedError extends AppErrorBase {
  readonly kind: 'rate-limited';
  readonly retryAfterSeconds?: number;
}

/**
 * A write that lost a race.
 *
 * `currentVersion` is the discriminator between the two things a 409 means on
 * this API, and carrying it is what lets a caller tell them apart: present
 * means "someone saved while your form was open", absent means the payload
 * collided with a record that already exists - a duplicate email. Without it
 * both arrive as an unhelpful "there was a conflict".
 */
export interface ConflictError extends AppErrorBase {
  readonly kind: 'conflict';
  readonly currentVersion?: number;
}

export interface SimpleAppError extends AppErrorBase {
  readonly kind: Exclude<AppErrorKind, 'validation' | 'rate-limited' | 'conflict'>;
}

export type AppError = ValidationError | RateLimitedError | ConflictError | SimpleAppError;

/** Default translation key per kind. A caller may override for context. */
export const DEFAULT_ERROR_MESSAGE_KEYS: Readonly<Record<AppErrorKind, string>> = {
  validation: 'errors.validation',
  authentication: 'errors.authentication',
  authorization: 'errors.authorization',
  'not-found': 'errors.notFound',
  conflict: 'errors.conflict',
  'rate-limited': 'errors.rateLimited',
  server: 'errors.server',
  network: 'errors.network',
  timeout: 'errors.timeout',
  cancelled: 'errors.cancelled',
  unknown: 'errors.unknown',
};

const APP_ERROR_KINDS = new Set<string>(Object.keys(DEFAULT_ERROR_MESSAGE_KEYS));

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof (value as { kind: unknown }).kind === 'string' &&
    APP_ERROR_KINDS.has((value as { kind: string }).kind)
  );
}

/**
 * Builds an error of a kind that carries no extra data.
 *
 * Validation and rate-limit errors are constructed directly, because their
 * extra fields are the point of having them.
 */
export function appError(
  kind: SimpleAppError['kind'],
  details: Omit<SimpleAppError, 'kind' | 'messageKey'> & { messageKey?: string } = {},
): SimpleAppError {
  const { messageKey, ...rest } = details;
  return { kind, messageKey: messageKey ?? DEFAULT_ERROR_MESSAGE_KEYS[kind], ...rest };
}

/**
 * The translation key for whatever went wrong.
 *
 * Feature code catches `unknown` - that is what `catch` and RxJS hand it - and
 * every one of those call sites needs the same two lines. Centralising them
 * means a value that somehow reached a component without passing the HTTP
 * layer still renders a sentence rather than `[object Object]`.
 */
export function messageKeyOf(error: unknown): string {
  return isAppError(error) ? error.messageKey : DEFAULT_ERROR_MESSAGE_KEYS.unknown;
}
