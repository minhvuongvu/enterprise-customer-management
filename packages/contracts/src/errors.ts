import { z } from 'zod';

/**
 * The error envelope. Every non-2xx response from the mock API has this shape.
 *
 * Two deliberate properties:
 *
 *  - The server sends a machine-readable `code`, not a sentence to display.
 *    Translating is the client's job, so the API never has to know what
 *    language a user reads, and a message can be reworded without a deploy.
 *  - `message` exists for developers and logs. The application must not render
 *    it (ANGULAR_PROJECT_CONTEXT.md 4.7 forbids showing raw backend errors),
 *    and it is documented as such on both sides.
 */

export const apiErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** The HTTP status each code is sent with. One code, one status, always. */
export const API_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/**
 * Field path to messages.
 *
 * Keys are dotted paths, so a nested field is addressable: `address.city`, not
 * just `address`. Issues that belong to the payload as a whole - an unknown
 * key, a failed cross-field rule - are collected under `_`.
 *
 * The messages are developer-facing for the same reason `message` is. A form
 * shows its own translated text; this tells it which fields to mark.
 */
export const fieldErrorsSchema = z.record(z.string(), z.array(z.string()));
export type FieldErrors = z.infer<typeof fieldErrorsSchema>;

export const apiErrorDetailsSchema = z.object({
  /** Present when the code is VALIDATION_FAILED. */
  fieldErrors: fieldErrorsSchema.optional(),
  /** Present when the code is RATE_LIMITED. */
  retryAfterSeconds: z.number().nonnegative().optional(),
  /** Present when the code is CONFLICT on a versioned write. */
  currentVersion: z.int().nonnegative().optional(),
});
export type ApiErrorDetails = z.infer<typeof apiErrorDetailsSchema>;

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    /** Developer-facing. Never rendered to a user. */
    message: z.string(),
    /** Echoes the request's correlation id, so both logs can be joined. */
    correlationId: z.string(),
    details: apiErrorDetailsSchema.optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
