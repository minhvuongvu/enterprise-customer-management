import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { sessionResponseSchema, type LoginRequest, type SessionResponse } from '@ecm/contracts';
import { map, type Observable } from 'rxjs';
import { AppConfigStore } from '../config/app-config';
import { appError } from '../errors/app-error';

/**
 * The two session calls Phase 2 needs in order to reach the API at all.
 *
 * Every customer endpoint is behind `requireAuth` on the mock backend, so a
 * phase about customer data cannot avoid having a session. What it *can* avoid
 * is implementing Phase 3: there is no refresh, no expiry handling, no logout
 * and no permission model here. See ADR-0012 for the line and why it is drawn
 * where it is.
 *
 * Same three properties as every other client in this repository: base URL
 * from runtime configuration, response validated against the contract,
 * failures leaving as `AppError`.
 */
@Injectable({ providedIn: 'root' })
export class SessionApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigStore).config;

  /**
   * Exchanges credentials for session cookies.
   *
   * `withCredentials` is not set: the request is same-origin through the dev
   * proxy, so the cookies are first-party and travel by default. Setting it
   * would only matter for a cross-origin API, which this deployment shape does
   * not have.
   */
  login(credentials: LoginRequest): Observable<SessionResponse> {
    return this.http
      .post<unknown>(`${this.config().apiBaseUrl}/auth/login`, credentials)
      .pipe(map((body) => this.parse(body)));
  }

  /** The session behind the cookies the browser already holds, if any. */
  current(): Observable<SessionResponse> {
    return this.http
      .get<unknown>(`${this.config().apiBaseUrl}/auth/session`)
      .pipe(map((body) => this.parse(body)));
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
