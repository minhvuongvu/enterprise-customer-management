import { HttpInterceptorFn } from '@angular/common/http';
import { DOCUMENT, inject } from '@angular/core';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@ecm/contracts';
import { IS_BROWSER } from '../platform/platform.tokens';

/** Methods that cannot change state, and so are not defended. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Echoes the CSRF cookie into a request header — the client half of the mock
 * API's double-submit defence.
 *
 * The session cookie is `HttpOnly` and `SameSite=Lax`, so a cross-site form
 * post cannot read it but would still cause it to be *sent*. The second token
 * closes that: it is readable by same-origin script and must be echoed in a
 * header, which an attacker's page cannot do. The server compares the two.
 *
 * Three properties of this implementation are deliberate:
 *
 *  - **Only unsafe methods.** A GET that needs protecting would be a design
 *    error in the API, not something to patch here.
 *  - **Only same-origin requests.** A token is a credential; sending it to
 *    whatever host `apiBaseUrl` happens to name would hand it to that host.
 *    Relative URLs are the same origin by definition, which is what the dev
 *    proxy and a deployed reverse proxy both produce.
 *  - **Nothing on the server.** There is no cookie jar while server-rendering,
 *    and no mutation happens there either.
 *
 * This is transport mechanics, so it is an interceptor. It is *not*
 * authentication: sessions, refresh and expiry belong to `SessionService` and
 * `authRefreshInterceptor` (ADR-0016, ADR-0017). It sits below the refresh
 * interceptor so that a retried request is stamped again from the cookie.
 */
export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  const isBrowser = inject(IS_BROWSER);
  const document = inject(DOCUMENT);

  if (!isBrowser || SAFE_METHODS.has(req.method) || !isSameOrigin(req.url)) {
    return next(req);
  }

  const token = readCookie(document.cookie, CSRF_COOKIE_NAME);
  if (!token) {
    // Not an error to raise here: the request goes out and the server answers
    // 403, which the error taxonomy already maps. Failing locally would hide
    // the real reason, which is that there is no session.
    return next(req);
  }

  return next(req.clone({ setHeaders: { [CSRF_HEADER_NAME]: token } }));
};

/**
 * True for a URL that resolves against the current origin.
 *
 * A protocol-relative URL (`//evil.test/api`) is a cross-origin URL that looks
 * relative, so it is excluded explicitly rather than by the leading slash.
 */
function isSameOrigin(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//');
}

function readCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}
