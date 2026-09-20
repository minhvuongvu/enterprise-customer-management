import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { CORRELATION_ID } from './correlation-id.interceptor';
import { appError } from '../errors/app-error';
import { mapHttpError } from '../errors/http-error-mapper';
import { Logger } from '../logging/logger';

/**
 * Turns transport failures into the application's error taxonomy.
 *
 * Downstream of this interceptor nothing ever sees an `HttpErrorResponse`, so
 * no feature has to know what a 409 means - only what a `conflict` is.
 */
export const errorMappingInterceptor: HttpInterceptorFn = (req, next) => {
  const logger = inject(Logger);

  return next(req).pipe(
    catchError((error: unknown) => {
      const correlationId = req.context.get(CORRELATION_ID) ?? undefined;

      const mapped =
        error instanceof HttpErrorResponse
          ? mapHttpError(error, correlationId)
          : appError('unknown', { correlationId, cause: error });

      logger.error('HTTP request failed', {
        method: req.method,
        url: req.urlWithParams,
        kind: mapped.kind,
        status: mapped.status,
        correlationId,
      });

      return throwError(() => mapped);
    }),
  );
};
