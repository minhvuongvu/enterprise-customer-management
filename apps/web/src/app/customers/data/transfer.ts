import { HttpEventType, HttpResponse, type HttpEvent } from '@angular/common/http';
import { filter, map, type OperatorFunction } from 'rxjs';

/**
 * A file transfer as the application sees it: some progress, then a result.
 *
 * `HttpEvent` has seven kinds, of which a page cares about two. This narrows
 * the stream at the API boundary, the same way `AppError` narrows failures,
 * so a component renders "40 %" and "done" without knowing what an
 * `HttpEventType.UploadProgress` is.
 *
 * `total` is `null` when the size is unknown - a response without a
 * `Content-Length`. The UI then shows activity rather than a percentage it
 * would have to invent.
 */
export type Transfer<T> =
  | { readonly kind: 'progress'; readonly loaded: number; readonly total: number | null }
  | { readonly kind: 'done'; readonly value: T };

/** The fraction transferred, or `null` when there is no honest answer. */
export function fractionOf(transfer: Transfer<unknown>): number | null {
  if (transfer.kind === 'done') {
    return 1;
  }
  return transfer.total ? Math.min(1, transfer.loaded / transfer.total) : null;
}

export function toTransfer<R, T>(
  parse: (response: HttpResponse<R>) => T,
): OperatorFunction<HttpEvent<R>, Transfer<T>> {
  return (source) =>
    source.pipe(
      filter(
        (event) =>
          event.type === HttpEventType.UploadProgress ||
          event.type === HttpEventType.DownloadProgress ||
          event.type === HttpEventType.Response,
      ),
      map((event): Transfer<T> => {
        if (event.type === HttpEventType.Response) {
          return { kind: 'done', value: parse(event) };
        }
        const progress = event as { loaded: number; total?: number };
        return { kind: 'progress', loaded: progress.loaded, total: progress.total ?? null };
      }),
    );
}
