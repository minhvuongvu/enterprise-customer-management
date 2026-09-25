import { randomBytes } from 'node:crypto';
import type { FixtureUser } from '@ecm/contracts';

/**
 * Session storage.
 *
 * Opaque random tokens in a Map, not JWTs. A JWT would add signing, claims and
 * expiry parsing without changing anything the frontend has to deal with - and
 * it would invite the "store the JWT in localStorage" pattern this project
 * deliberately avoids. What the client sees is an HttpOnly cookie it cannot
 * read, which is the shape that matters.
 *
 * Sessions live in memory, so a restart signs everyone out. That is the same
 * trade-off as the dataset, and it makes the expired-session path easy to
 * exercise by hand.
 */

export interface ActiveSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Readable by the client, unlike the session cookies. See requireCsrf. */
  readonly csrfToken: string;
  readonly userId: string;
  expiresAt: number;
  refreshExpiresAt: number;
}

function token(): string {
  return randomBytes(32).toString('base64url');
}

export class SessionRegistry {
  private readonly byAccess = new Map<string, ActiveSession>();
  private readonly byRefresh = new Map<string, ActiveSession>();

  // Not constructor parameter properties: Node strips types rather than
  // compiling them, and that mode rejects the shorthand. See ADR-0007.
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  constructor(accessTtlSeconds: number, refreshTtlSeconds: number) {
    this.accessTtlSeconds = accessTtlSeconds;
    this.refreshTtlSeconds = refreshTtlSeconds;
  }

  create(user: FixtureUser): ActiveSession {
    const now = Date.now();
    const session: ActiveSession = {
      accessToken: token(),
      refreshToken: token(),
      csrfToken: token(),
      userId: user.id,
      expiresAt: now + this.accessTtlSeconds * 1000,
      refreshExpiresAt: now + this.refreshTtlSeconds * 1000,
    };
    this.byAccess.set(session.accessToken, session);
    this.byRefresh.set(session.refreshToken, session);
    return session;
  }

  /** Returns the session only while the access token is still valid. */
  resolveAccess(accessToken: string | undefined): ActiveSession | undefined {
    if (!accessToken) {
      return undefined;
    }
    const session = this.byAccess.get(accessToken);
    if (!session) {
      return undefined;
    }
    if (Date.now() >= session.expiresAt) {
      // Expired but not forgotten: the refresh token may still be good, and
      // the client is expected to use it rather than send the user to login.
      return undefined;
    }
    return session;
  }

  /**
   * Exchanges a refresh token for a new access token.
   *
   * The refresh token is rotated on use. A token that is presented twice is
   * therefore rejected the second time, which is what makes a stolen one worth
   * less - and what makes Phase 3's "do not fire two refreshes at once"
   * requirement have teeth.
   */
  refresh(refreshToken: string | undefined): ActiveSession | undefined {
    if (!refreshToken) {
      return undefined;
    }
    const session = this.byRefresh.get(refreshToken);
    if (!session || Date.now() >= session.refreshExpiresAt) {
      return undefined;
    }

    this.byAccess.delete(session.accessToken);
    this.byRefresh.delete(session.refreshToken);

    const now = Date.now();
    const rotated: ActiveSession = {
      accessToken: token(),
      refreshToken: token(),
      csrfToken: session.csrfToken,
      userId: session.userId,
      expiresAt: now + this.accessTtlSeconds * 1000,
      refreshExpiresAt: session.refreshExpiresAt,
    };
    this.byAccess.set(rotated.accessToken, rotated);
    this.byRefresh.set(rotated.refreshToken, rotated);
    return rotated;
  }

  /**
   * Ends a session, found by its access token or - when the browser no longer
   * sends one - by its CSRF token, which lives as long as the refresh token
   * and survives rotation. See the logout route.
   */
  destroy(accessToken: string | undefined, csrfToken?: string): void {
    const session =
      (accessToken ? this.byAccess.get(accessToken) : undefined) ??
      (csrfToken ? this.findByCsrf(csrfToken) : undefined);
    if (session) {
      this.byAccess.delete(session.accessToken);
      this.byRefresh.delete(session.refreshToken);
    }
  }

  private findByCsrf(csrfToken: string): ActiveSession | undefined {
    for (const session of this.byRefresh.values()) {
      if (session.csrfToken === csrfToken) {
        return session;
      }
    }
    return undefined;
  }

  /** Forces expiry of the access token. Backs the `expired-session` scenario. */
  expireAccess(accessToken: string | undefined): void {
    if (!accessToken) {
      return;
    }
    const session = this.byAccess.get(accessToken);
    if (session) {
      session.expiresAt = Date.now() - 1;
    }
  }
}
