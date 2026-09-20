import type { RequestHandler } from 'express';
import { rateLimited } from '../http/api-error.ts';

/**
 * A fixed-window rate limiter, deliberately simple.
 *
 * It exists so 429 is a real code path with a real `Retry-After` header rather
 * than a branch nobody has run. The limit is high enough that ordinary use
 * never reaches it; tests use the `rate-limit` scenario to get a deterministic
 * 429 instead of sending six hundred requests.
 *
 * A fixed window lets a client send up to twice the limit across a window
 * boundary. That is a real flaw of the algorithm, and naming it is more useful
 * here than hiding it behind a sliding-window implementation nobody reads.
 */
export function rateLimit(limitPerMinute: number): RequestHandler {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const current = windows.get(key);

    if (!current || now >= current.resetAt) {
      windows.set(key, { count: 1, resetAt: now + 60_000 });
      next();
      return;
    }

    current.count += 1;
    if (current.count > limitPerMinute) {
      const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      next(rateLimited(retryAfterSeconds));
      return;
    }

    next();
  };
}
