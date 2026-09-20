import type { RequestHandler } from 'express';

/**
 * Security headers, set by hand rather than by a library.
 *
 * A library would set these in one line and teach nothing. Each header below
 * says what it defends against, because the point of this repository is that a
 * reader can tell which protections are real and who owns them.
 *
 * **Ownership.** In production most of this belongs to the reverse proxy or the
 * CDN in front of the application, not to the API process - and HSTS belongs
 * only there, because it is meaningless over the plain HTTP this mock serves.
 * `docs/mock-backend.md` sets out the full split between frontend, backend,
 * proxy and browser.
 */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  // Stops a browser from guessing a different Content-Type than we sent. Without
  // it, an uploaded file served as text/plain can be sniffed into script.
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // API responses are never a document, so framing them is never legitimate.
  res.setHeader('X-Frame-Options', 'DENY');

  // Do not leak the path a user came from to third parties.
  res.setHeader('Referrer-Policy', 'no-referrer');

  // This process serves JSON and file downloads, never a page with script. The
  // restrictive policy is therefore free; the application's own CSP, which is a
  // different and harder problem, is Phase 3's and belongs at the proxy.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );

  // Nothing here needs a camera, a microphone or a location.
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Responses are per-user. A shared cache must never reuse one.
  res.setHeader('Cache-Control', 'no-store');

  next();
};
