import type { ApiErrorBody } from '@ecm/contracts';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError } from '../http/api-error.ts';

/**
 * The single exit for every failure.
 *
 * Route handlers throw; this builds the envelope. One place means one shape,
 * including for the failures nobody anticipated - an unexpected exception
 * becomes a 500 in the same format as everything else, rather than Express's
 * default HTML stack trace.
 */

/** Anything that reaches here matched no route. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new ApiError('NOT_FOUND', 'No such endpoint.'));
};

export function errorHandler(logErrors: boolean): ErrorRequestHandler {
  // Express identifies an error handler by its arity, so `next` must stay.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (error, req, res, next) => {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError('INTERNAL_ERROR', error instanceof Error ? error.message : String(error));

    if (apiError.status >= 500 && logErrors) {
      // Unexpected failures are logged with their stack; expected ones (a 404,
      // a 409) are normal traffic and would be noise.
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'Unhandled request failure',
          correlationId: req.correlationId,
          method: req.method,
          path: req.path,
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
    }

    if (apiError.details?.retryAfterSeconds !== undefined && !res.getHeader('Retry-After')) {
      res.setHeader('Retry-After', String(apiError.details.retryAfterSeconds));
    }

    const body: ApiErrorBody = {
      error: {
        code: apiError.code,
        message: apiError.message,
        correlationId: req.correlationId ?? 'unknown',
        details: apiError.details,
      },
    };

    res.status(apiError.status).json(body);
  };
}
