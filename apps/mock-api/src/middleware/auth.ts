import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  findFixtureUserById,
  roleHasPermission,
  type FixtureUser,
  type Permission,
} from '@ecm/contracts';
import type { Request, RequestHandler } from 'express';
import type { SessionRegistry } from '../domain/sessions.ts';
import { forbidden, unauthenticated } from '../http/api-error.ts';
import { hasScenario } from './fault-injection.ts';

/**
 * Authentication and authorization, enforced here and nowhere else that counts.
 *
 * The Angular application also checks permissions, to decide what to show. That
 * is a user-experience decision. **This** is the security boundary: every
 * request is checked again, against the session's role, regardless of what the
 * client believed it was allowed to do. A client can be modified; this cannot.
 *
 * ANGULAR_PROJECT_CONTEXT.md 3.2 requires that separation, and the tests prove
 * it by calling the API directly with a VIEWER session and no UI involved.
 */

/** Resolves the session cookie into a user, if there is one. Never rejects. */
export function authenticate(sessions: SessionRegistry): RequestHandler {
  return (req, _res, next) => {
    const accessToken = req.cookies?.[ACCESS_COOKIE_NAME] as string | undefined;

    if (hasScenario(req, 'expired-session')) {
      // Deterministically reproduces "the access token died mid-session", so
      // the refresh flow can be tested without waiting fifteen minutes.
      sessions.expireAccess(accessToken);
    }

    const session = sessions.resolveAccess(accessToken);
    req.authUser = session ? findFixtureUserById(session.userId) : undefined;
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.authUser) {
    next(unauthenticated());
    return;
  }
  next();
};

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    const user = req.authUser;
    if (!user) {
      next(unauthenticated());
      return;
    }
    if (!roleHasPermission(user.role, permission)) {
      next(forbidden(`Role ${user.role} does not have ${permission}.`));
      return;
    }
    next();
  };
}

/**
 * CSRF protection by double submit.
 *
 * The session cookie is `HttpOnly` and `SameSite=Lax`, so a cross-site form
 * post cannot read it - but it would still be *sent*. The defence is a second
 * token that is readable by same-origin script and must be echoed in a header:
 * an attacker's page can cause the request, but cannot read the cookie to fill
 * in the header.
 *
 * Only unsafe methods are checked. A GET that changes state would be a design
 * error, not something to patch here.
 */
export const requireCsrf: RequestHandler = (req, _res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
  const headerToken = req.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    next(forbidden('CSRF token missing or does not match.'));
    return;
  }

  next();
};

/**
 * The authenticated user, for handlers that sit behind `requireAuth`.
 *
 * A function rather than a non-null assertion: if a route is ever moved out
 * from behind the guard, this fails with a 401 instead of a TypeError.
 */
export function currentUser(req: Request): FixtureUser {
  if (!req.authUser) {
    throw unauthenticated();
  }
  return req.authUser;
}
