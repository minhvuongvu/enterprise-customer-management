import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  auditListResponseSchema,
  avatarUploadResponseSchema,
  bulkResponseSchema,
  customerSchema,
  importPreviewSchema,
  importResultSchema,
  pageResponseSchema,
  type AuditEntry,
  type AvatarUploadResponse,
  type BulkRequest,
  type BulkResponse,
  type CreateCustomerRequest,
  type Customer,
  type CustomerId,
  type ImportPreview,
  type ImportResult,
  type PageResponse,
  type UpdateCustomerRequest,
} from '@ecm/contracts';
import { map, type Observable } from 'rxjs';
import type { z } from 'zod';
import { AppConfigStore } from '../../core/config/app-config';
import { appError } from '../../core/errors/app-error';
import type { CustomerListCriteria } from './customer-list-criteria';
import { withReadPolicy, withWritePolicy } from './request-policy';
import { toTransfer, type Transfer } from './transfer';

/**
 * Every HTTP call the customer feature makes, and the only place it makes one.
 *
 * It follows the pattern `core/api/health.api.ts` established: base URL from
 * runtime configuration, response validated against the contract, failures
 * leaving as `AppError`. What it adds is the part a real feature needs and a
 * health check does not - a timeout and retry policy chosen per endpoint (see
 * `request-policy.ts`).
 *
 * What it deliberately has **no** idea about: loading states, caching,
 * selection, forms or the URL. This class turns a request into a validated
 * value and nothing else, which is what makes it testable with
 * `HttpTestingController` and nothing else.
 *
 * Cancellation is not implemented here either. It is a property of the
 * subscription, and the store gets it by switching between requests rather than
 * by the client tracking anything - see `customer-store.ts`.
 */

/** Built once: constructing a schema per request is measurable at 50,000 rows. */
const customerPageSchema = pageResponseSchema(customerSchema);

@Injectable({ providedIn: 'root' })
export class CustomerApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigStore).config;

  private get baseUrl(): string {
    return `${this.config().apiBaseUrl}/customers`;
  }

  /** A page of customers. Filtering, sorting and paging all happen server-side. */
  list(criteria: CustomerListCriteria): Observable<PageResponse<Customer>> {
    return this.http
      .get<unknown>(this.baseUrl, { params: toHttpParams(criteria) })
      .pipe(withReadPolicy(), map(parseWith(customerPageSchema)));
  }

  getById(id: CustomerId): Observable<Customer> {
    return this.http
      .get<unknown>(`${this.baseUrl}/${encodeURIComponent(id)}`)
      .pipe(withReadPolicy(), map(parseWith(customerSchema)));
  }

  auditTrail(id: CustomerId): Observable<readonly AuditEntry[]> {
    return this.http.get<unknown>(`${this.baseUrl}/${encodeURIComponent(id)}/audit`).pipe(
      withReadPolicy(),
      map(parseWith(auditListResponseSchema)),
      map((response) => response.items),
    );
  }

  create(input: CreateCustomerRequest): Observable<Customer> {
    return this.http
      .post<unknown>(this.baseUrl, input)
      .pipe(withWritePolicy(), map(parseWith(customerSchema)));
  }

  /**
   * A partial update, carrying the version the client last saw.
   *
   * PATCH rather than PUT because the client genuinely has a partial: it knows
   * what the user changed, and sending the whole record back would overwrite
   * fields it never displayed with values it read minutes ago.
   */
  update(id: CustomerId, input: UpdateCustomerRequest): Observable<Customer> {
    return this.http
      .patch<unknown>(`${this.baseUrl}/${encodeURIComponent(id)}`, input)
      .pipe(withWritePolicy(), map(parseWith(customerSchema)));
  }

  remove(id: CustomerId): Observable<void> {
    return this.http.delete<unknown>(`${this.baseUrl}/${encodeURIComponent(id)}`).pipe(
      withWritePolicy(),
      map(() => undefined),
    );
  }

  /** Bulk activate, deactivate or delete. Answers per item - see `BulkResponse`. */
  bulk(request: BulkRequest): Observable<BulkResponse> {
    return this.http
      .post<unknown>(`${this.baseUrl}/bulk`, request)
      .pipe(withWritePolicy(), map(parseWith(bulkResponseSchema)));
  }

  // ------------------------------------------------------------------ files
  //
  // No timeout policy on these. A timeout sized for a JSON request would cut
  // off a large file on a slow connection, and a transfer the user can watch
  // and cancel does not need one: cancelling is the user's timeout.

  /**
   * Uploads an avatar, reporting upload progress.
   *
   * `reportUploadProgress` is what routes this request through XHR rather
   * than fetch (`UploadAwareBackend`, ADR-0021). Unsubscribing aborts it.
   */
  uploadAvatar(id: CustomerId, file: File): Observable<Transfer<AvatarUploadResponse>> {
    return this.http
      .post<unknown>(`${this.baseUrl}/${encodeURIComponent(id)}/avatar`, formWith(file), {
        observe: 'events',
        reportUploadProgress: true,
      })
      .pipe(toTransfer((response) => parseWith(avatarUploadResponseSchema)(response.body)));
  }

  /** Validates every row of a CSV and writes nothing. */
  previewImport(file: File): Observable<Transfer<ImportPreview>> {
    return this.http
      .post<unknown>(`${this.baseUrl}/import`, formWith(file), {
        params: { mode: 'preview' },
        observe: 'events',
        reportUploadProgress: true,
      })
      .pipe(toTransfer((response) => parseWith(importPreviewSchema)(response.body)));
  }

  /** Imports a CSV, answering per row. Partial success is a 200. */
  importFile(file: File): Observable<Transfer<ImportResult>> {
    return this.http
      .post<unknown>(`${this.baseUrl}/import`, formWith(file), {
        params: { mode: 'commit' },
        observe: 'events',
        reportUploadProgress: true,
      })
      .pipe(toTransfer((response) => parseWith(importResultSchema)(response.body)));
  }

  /**
   * The customers matching these criteria, as CSV, with download progress.
   *
   * Paging is ignored by the server - "export what I am looking at" means
   * every page of it.
   */
  exportCsv(criteria: CustomerListCriteria): Observable<Transfer<ExportedFile>> {
    return this.http
      .get(`${this.baseUrl}/export`, {
        params: toHttpParams(criteria),
        observe: 'events',
        reportProgress: true,
        responseType: 'blob',
      })
      .pipe(
        toTransfer((response) => ({
          blob: response.body ?? new Blob([]),
          fileName: fileNameFrom(response.headers.get('content-disposition')) ?? 'customers.csv',
        })),
      );
  }

  /**
   * Looks for an existing customer with this email address.
   *
   * There is no `/customers/email-available` endpoint, and inventing one for
   * the mock would be inventing a backend feature to make a frontend exercise
   * easier. The list endpoint already searches over email, so this asks it for
   * a single row and compares exactly - the search is a substring match, so
   * "an@example.test" would otherwise be reported as taken by
   * "an@example.test.vn".
   */
  findByEmail(email: string): Observable<Customer | null> {
    const params = new HttpParams().set('search', email).set('size', 1);
    return this.http.get<unknown>(this.baseUrl, { params }).pipe(
      withReadPolicy(),
      map(parseWith(customerPageSchema)),
      map((page) => {
        const match = page.items.find(
          (candidate) => candidate.email.toLowerCase() === email.toLowerCase(),
        );
        return match ?? null;
      }),
    );
  }
}

/** A downloaded file, ready to hand to the browser. */
export interface ExportedFile {
  readonly blob: Blob;
  readonly fileName: string;
}

function formWith(file: File): FormData {
  const form = new FormData();
  form.append('file', file, file.name);
  return form;
}

/**
 * The filename a `Content-Disposition: attachment; filename="…"` header names.
 * Only the plain form is read; anything else falls back to a default rather
 * than trusting a path the server did not mean to send.
 */
function fileNameFrom(header: string | null): string | null {
  const match = header ? /filename="([^"/\\]+)"/.exec(header) : null;
  return match ? match[1] : null;
}

/**
 * Turns criteria into query parameters, omitting what is empty.
 *
 * `page` and `size` are always sent: relying on the server's defaults would
 * mean the client and the server each have their own idea of a page size, and
 * they would agree right up until one of them changed.
 */
function toHttpParams(criteria: CustomerListCriteria): HttpParams {
  let params = new HttpParams()
    .set('page', criteria.page)
    .set('size', criteria.size)
    .set('sort', criteria.sort);

  const optional: Record<string, string> = {
    search: criteria.search,
    status: criteria.status,
    gender: criteria.gender,
    createdFrom: criteria.createdFrom,
    createdTo: criteria.createdTo,
  };

  for (const [key, value] of Object.entries(optional)) {
    if (value) {
      params = params.set(key, value);
    }
  }

  return params;
}

/**
 * Validates a response body, or fails at the boundary.
 *
 * A 200 whose body is not what the contract promises is a *server* error: the
 * user did nothing wrong and can do nothing about it. Classifying it here is
 * what stops it surfacing three layers away as `undefined is not an object`
 * inside a template.
 */
function parseWith<S extends z.ZodType>(schema: S): (body: unknown) => z.output<S> {
  return (body) => {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw appError('server', { messageKey: 'errors.server', cause: parsed.error });
    }
    return parsed.data;
  };
}
