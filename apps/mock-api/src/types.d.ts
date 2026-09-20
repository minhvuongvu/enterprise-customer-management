import type { FixtureUser } from '@ecm/contracts';

/**
 * Request properties this server attaches.
 *
 * Declared once here rather than cast at each use: a handler that reads
 * `req.session` should get a type error if it forgot to sit behind
 * `requireAuth`, not a runtime `undefined`.
 */
declare global {
  namespace Express {
    interface Request {
      /** Set by the correlation-id middleware for every request. */
      correlationId: string;
      /** Set by `requireAuth`. Undefined on public routes. */
      authUser?: FixtureUser;
    }
  }
}

export {};
