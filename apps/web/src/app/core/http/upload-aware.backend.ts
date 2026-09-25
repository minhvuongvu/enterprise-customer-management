import {
  FetchBackend,
  HttpBackend,
  HttpXhrBackend,
  type HttpEvent,
  type HttpRequest,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

/**
 * Sends a request that asks for upload progress through XMLHttpRequest, and
 * every other request through `fetch`.
 *
 * ## Why two transports
 *
 * `fetch` cannot report upload progress - there is no event for bytes sent -
 * and Angular's `FetchBackend` throws if asked to. `XMLHttpRequest` can
 * (`xhr.upload.onprogress`). The application uses `fetch` everywhere else for
 * the reason in `http.providers.ts`: it is what server-side rendering is built
 * around. So the choice is made per request, by the one thing that
 * distinguishes the two cases: `reportUploadProgress`.
 *
 * Both transports sit *below* the interceptor chain, so an upload gets the
 * correlation id, the CSRF header, refresh-on-expiry and error mapping exactly
 * like any other request. Cancelling works the same way too: unsubscribing
 * aborts the XHR, which is how "cancel upload" stops bytes leaving the
 * browser rather than only hiding a progress bar. ADR-0021.
 */
@Injectable()
export class UploadAwareBackend implements HttpBackend {
  private readonly fetch = inject(FetchBackend);
  private readonly xhr = inject(HttpXhrBackend);

  handle(req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    return req.reportUploadProgress ? this.xhr.handle(req) : this.fetch.handle(req);
  }
}
