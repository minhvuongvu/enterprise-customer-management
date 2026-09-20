import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { healthResponseSchema, type HealthResponse } from '@ecm/contracts';
import { map, type Observable } from 'rxjs';
import { AppConfigStore } from '../config/app-config';
import { appError } from '../errors/app-error';

/**
 * The first data-access class, and the pattern the Phase 2 API clients follow.
 *
 * Three things it establishes:
 *
 *  - the base URL comes from runtime configuration, not from a constant, so one
 *    build runs against any environment;
 *  - a response is **validated** against the contract before it is returned, so
 *    a backend that drifts fails here with a clear error rather than three
 *    layers away as `undefined is not an object`;
 *  - a failure leaves here as an `AppError`, never as an `HttpErrorResponse`.
 */
@Injectable({ providedIn: 'root' })
export class HealthApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigStore).config;

  check(): Observable<HealthResponse> {
    return this.http.get<unknown>(`${this.config().apiBaseUrl}/health`).pipe(
      map((body) => {
        const parsed = healthResponseSchema.safeParse(body);
        if (!parsed.success) {
          // A 200 with the wrong shape is a server error, not a validation
          // error: the user did nothing wrong and cannot fix it.
          throw appError('server', {
            messageKey: 'errors.server',
            cause: parsed.error,
          });
        }
        return parsed.data;
      }),
    );
  }
}
