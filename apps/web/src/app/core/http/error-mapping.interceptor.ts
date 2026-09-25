import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { CORRELATION_ID } from './correlation-id.interceptor';
import { appError } from '../errors/app-error';
import { mapHttpError } from '../errors/http-error-mapper';

/**
 * Turns transport failures into the application's error taxonomy.
 *
 * Downstream of this interceptor nothing ever sees an `HttpErrorResponse`, so
 * no feature has to know what a 409 means - only what a `conflict` is.
 *
 * One responsibility: classification. Until Phase 3 it also logged the
 * failure; that moved to `requestLoggingInterceptor`, because an interceptor
 * that maps *and* reports would log a 401 that the refresh interceptor then
 * quietly recovers from as though it were an error the user saw.
 */
export const errorMappingInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: unknown) => {
      const correlationId = req.context.get(CORRELATION_ID) ?? undefined;

      const mapped =
        error instanceof HttpErrorResponse
          ? mapHttpError(error, correlationId)
          : appError('unknown', { correlationId, cause: error });

      return throwError(() => mapped);
    }),
  );
};
