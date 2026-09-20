import { CORRELATION_ID_HEADER, CSRF_HEADER_NAME } from '@ecm/contracts';
import type { RequestHandler } from 'express';
import { MOCK_SCENARIO_HEADER } from './fault-injection.ts';

/**
 * CORS, written out rather than delegated, because the interesting part is the
 * rule that a library hides:
 *
 * **`Access-Control-Allow-Origin` may not be `*` when credentials are allowed.**
 * The browser refuses that combination, and this API authenticates with cookies.
 * So the origin is echoed back from an allowlist, and `Vary: Origin` is set so
 * a cache never serves one origin's response to another.
 *
 * In production this is the reverse proxy's job. It is here because Phase 3 has
 * to show a real preflight, and a frontend-only mock cannot produce one.
 */
export function cors(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins.map((origin) => origin.trim()).filter(Boolean));

  return (req, res, next) => {
    const origin = req.get('Origin');

    // A same-origin request has no Origin header and needs no CORS headers.
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        ['content-type', CSRF_HEADER_NAME, CORRELATION_ID_HEADER, MOCK_SCENARIO_HEADER].join(','),
      );
      res.setHeader(
        'Access-Control-Expose-Headers',
        [CORRELATION_ID_HEADER, 'Retry-After'].join(','),
      );
      res.setHeader('Access-Control-Max-Age', '600');
      // 204: a preflight is an answer about the real request, never a request
      // of its own, so it must not reach a route handler.
      res.status(204).end();
      return;
    }

    res.setHeader(
      'Access-Control-Expose-Headers',
      [CORRELATION_ID_HEADER, 'Retry-After'].join(','),
    );
    next();
  };
}
