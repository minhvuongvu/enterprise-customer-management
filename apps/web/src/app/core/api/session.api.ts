import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { sessionResponseSchema, type LoginRequest, type SessionResponse } from '@ecm/contracts';
import { map, type Observable } from 'rxjs';
import { SKIP_SESSION_REFRESH } from '../auth/session-refresh.context';
import { AppConfigStore } from '../config/app-config';
import { appError } from '../errors/app-error';

/**
 * The four session endpoints.
 *
 * Same three properties as every other client in this repository: base URL
 * from runtime configuration, response validated against the contract,
 * failures leaving as `AppError`.
 *
 * **No token ever passes through this class.** The server sets the access and
 * refresh tokens as `HttpOnly` cookies, which script cannot read; what comes
 * back in a body is the user and the access token's expiry. That is the whole
 * of ADR-0016 in one sentence, and the reason there is nothing here to store.
 *
 * `withCredentials` is not set: the API is reached through the same origin -
 * the dev proxy, or a reverse proxy in a deployment - so the cookies are
 * first-party and travel by default. Setting it would only matter for a
 * cross-origin API, which this deployment shape does not have.
 */
@Injectable({ providedIn: 'root' })
export class SessionApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigStore).config;

  /** Exchanges credentials for session cookies. */
  login(credentials: LoginRequest): Observable<SessionResponse> {
    return this.http
      .post<unknown>(`${this.config().apiBaseUrl}/auth/login`, credentials, {
        context: withoutRefresh(),
      })
      .pipe(map((body) => this.parse(body)));
  }

  /**
   * The session behind the cookies the browser already holds, if any.
   *
   * Deliberately **not** excluded from refresh: after a reload an hour later
   * the access cookie has expired but the refresh cookie has not, and the
   * refresh interceptor turning that 401 into a renewal is exactly how the
   * user stays signed in.
   */
  current(): Observable<SessionResponse> {
    return this.http
      .get<unknown>(`${this.config().apiBaseUrl}/auth/session`)
      .pipe(map((body) => this.parse(body)));
  }

  /**
   * Trades the refresh cookie for a new access cookie, and rotates the
   * refresh cookie while doing so. The browser sends the refresh cookie on
   * its own - it is scoped to this path and nowhere else.
   */
  refresh(): Observable<SessionResponse> {
    return this.http
      .post<unknown>(`${this.config().apiBaseUrl}/auth/refresh`, null, {
        context: withoutRefresh(),
      })
      .pipe(map((body) => this.parse(body)));
  }

  /** Ends the session on the server, which also expires the cookies. */
  logout(): Observable<void> {
    return this.http
      .post<void>(`${this.config().apiBaseUrl}/auth/logout`, null, { context: withoutRefresh() })
      .pipe(map(() => undefined));
  }

  private parse(body: unknown): SessionResponse {
    const parsed = sessionResponseSchema.safeParse(body);
    if (!parsed.success) {
      // A 200 with the wrong shape is a server problem, not the user's.
      throw appError('server', { messageKey: 'errors.server', cause: parsed.error });
    }
    return parsed.data;
  }
}

function withoutRefresh(): HttpContext {
  return new HttpContext().set(SKIP_SESSION_REFRESH, true);
}
