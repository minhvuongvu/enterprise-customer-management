import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { customerSchema, pageResponseSchema, type Customer } from '@ecm/contracts';
import { map, type Observable } from 'rxjs';
import { AppConfigStore } from '../../core/config/app-config';
import { appError } from '../../core/errors/app-error';

/** How many customers the offline lab keeps. A first page, not the dataset. */
export const OFFLINE_PAGE_SIZE = 25;

const customerPageSchema = pageResponseSchema(customerSchema);

/**
 * The offline lab's one request: the first page of customers.
 *
 * Its own client rather than the customer feature's `CustomerApi`: a lab may
 * not reach into a feature (non-negotiable rule 4), and one GET does not
 * justify making the feature's API client public. It goes through the same
 * `HttpClient` and interceptors as every request - session cookie, CSRF,
 * error mapping - and validates the response against the same contract.
 */
@Injectable()
export class OfflineDirectoryApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigStore).config;

  firstPage(): Observable<Customer[]> {
    return this.http
      .get<unknown>(`${this.config().apiBaseUrl}/customers`, {
        params: { page: 1, size: OFFLINE_PAGE_SIZE, sort: 'customerCode,asc' },
      })
      .pipe(
        map((body) => {
          const parsed = customerPageSchema.safeParse(body);
          if (!parsed.success) {
            throw appError('server', { messageKey: 'errors.server', cause: parsed.error });
          }
          return parsed.data.items;
        }),
      );
  }
}
