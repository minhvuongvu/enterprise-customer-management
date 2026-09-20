import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  findFixtureUserById,
  findFixtureUserByUsername,
  loginRequestSchema,
  permissionsForRole,
  type FixtureUser,
  type SessionResponse,
} from '@ecm/contracts';
import { Router, type CookieOptions, type Response } from 'express';
import type { MockApiConfig } from '../config.ts';
import type { ActiveSession, SessionRegistry } from '../domain/sessions.ts';
import { unauthenticated } from '../http/api-error.ts';
import { parseOrThrow } from '../http/validate.ts';
import { currentUser, requireAuth, requireCsrf } from '../middleware/auth.ts';
import { hasScenario } from '../middleware/fault-injection.ts';

/**
 * Authentication endpoints.
 *
 * **This mock does not verify passwords.** A known username with any non-empty
 * password signs in. The alternative was to commit a credential to a fixture,
 * and "it is only a demo password" is how real ones end up in repositories.
 * The cost is that the wrong-password path is not naturally reachable, so the
 * `invalid-credentials` scenario provides it deterministically instead.
 *
 * Everything else about the flow is real: HttpOnly cookies, SameSite, CSRF
 * double-submit, refresh-token rotation, server-side expiry.
 */
export function authRoutes(sessions: SessionRegistry, config: MockApiConfig): Router {
  const router = Router();

  function sessionCookieOptions(maxAgeSeconds: number): CookieOptions {
    return {
      // The application cannot read this cookie. That is the point: a token in
      // localStorage is readable by any script that gets injected.
      httpOnly: true,
      // Lax still sends the cookie on a top-level navigation, which is what
      // makes a bookmarked deep link work after signing in. Cross-site POSTs
      // are handled by the CSRF token, not by SameSite alone.
      sameSite: 'lax',
      secure: config.secureCookies,
      path: '/',
      maxAge: maxAgeSeconds * 1000,
    };
  }

  function issue(res: Response, session: ActiveSession, user: FixtureUser): SessionResponse {
    res.cookie(
      ACCESS_COOKIE_NAME,
      session.accessToken,
      sessionCookieOptions(config.accessTtlSeconds),
    );
    res.cookie(
      REFRESH_COOKIE_NAME,
      session.refreshToken,
      // Scoped to the refresh endpoint: a cookie that is not sent with ordinary
      // requests cannot leak from one.
      { ...sessionCookieOptions(config.refreshTtlSeconds), path: '/api/auth/refresh' },
    );
    res.cookie(CSRF_COOKIE_NAME, session.csrfToken, {
      // Deliberately readable by script - the client must echo it in a header,
      // which is precisely what a cross-site attacker cannot do.
      httpOnly: false,
      sameSite: 'lax',
      secure: config.secureCookies,
      path: '/',
      maxAge: config.refreshTtlSeconds * 1000,
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        // Derived server-side. A client that computed its own permissions
        // would be deciding what it is allowed to do.
        permissions: [...permissionsForRole(user.role)],
      },
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  router.post('/login', (req, res) => {
    const credentials = parseOrThrow(loginRequestSchema, req.body, 'login request');

    if (hasScenario(req, 'invalid-credentials')) {
      throw unauthenticated('Invalid username or password.');
    }

    const user = findFixtureUserByUsername(credentials.username);
    if (!user) {
      // The same message for an unknown user and a bad password, so the
      // response cannot be used to enumerate accounts.
      throw unauthenticated('Invalid username or password.');
    }

    res.status(200).json(issue(res, sessions.create(user), user));
  });

  router.post('/refresh', requireCsrf, (req, res) => {
    const rotated = sessions.refresh(req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined);
    if (!rotated) {
      // Covers all three: no cookie, expired, and - because refresh tokens are
      // rotated on use - replayed. Phase 3's "failed refresh clears the
      // session" path starts here.
      throw unauthenticated('Refresh token is missing, expired or already used.');
    }

    const user = findFixtureUserById(rotated.userId);
    if (!user) {
      throw unauthenticated('Session refers to an unknown user.');
    }

    res.status(200).json(issue(res, rotated, user));
  });

  router.get('/session', requireAuth, (req, res) => {
    const user = currentUser(req);
    res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        permissions: [...permissionsForRole(user.role)],
      },
      // The client already holds a cookie; this echoes the shape of /login so
      // both paths produce the same state.
      expiresAt: new Date(Date.now() + config.accessTtlSeconds * 1000).toISOString(),
    });
  });

  router.post('/logout', requireCsrf, (req, res) => {
    sessions.destroy(req.cookies?.[ACCESS_COOKIE_NAME] as string | undefined);
    res.clearCookie(ACCESS_COOKIE_NAME, { path: '/' });
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth/refresh' });
    res.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
    res.status(204).end();
  });

  return router;
}
