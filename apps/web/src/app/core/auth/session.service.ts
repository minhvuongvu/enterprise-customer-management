import { computed, inject, Injectable, signal } from '@angular/core';
import { map, tap, type Observable } from 'rxjs';
import { SessionApi } from '../api/session.api';

/**
 * Authentication seam.
 *
 * Phase 3 implements logout, token refresh, expiry and the route guard. Phase 0
 * defined the shape they will fill, so that routing, the HTTP layer and later
 * the UI can already depend on "is there a session" without being rewritten
 * when the answer stops being hardcoded.
 *
 * Phase 2 filled in exactly one of those: `signIn`. Every customer endpoint is
 * behind authentication on the server, so a phase about customer data cannot
 * run without a session - and a sign-in that establishes one is a much smaller
 * thing than the session *management* Phase 3 owns. ADR-0012 states the line.
 *
 * `unknown` is a real state, not a placeholder: before the session has been
 * checked, the app must not decide that the user is anonymous and bounce them
 * to the login page.
 */
export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated';

/**
 * The authenticated user is an API type, so it is defined once in
 * `@ecm/contracts` and re-exported here for convenience. Declaring a second
 * shape for the same value is how the two drift - and the one that is wrong is
 * always the one nobody is looking at.
 */
import type { SessionUser } from '@ecm/contracts';
export type { SessionUser };

interface SessionState {
  readonly status: SessionStatus;
  readonly user: SessionUser | null;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(SessionApi);

  private readonly state = signal<SessionState>({ status: 'unknown', user: null });

  readonly status = computed(() => this.state().status);
  readonly user = computed(() => this.state().user);
  readonly isAuthenticated = computed(() => this.state().status === 'authenticated');

  /**
   * Signs in and records who is signed in.
   *
   * The tokens are never seen by this code: the server sets them as cookies,
   * one of them `HttpOnly`. What arrives here is the user, and the browser
   * carries the credential on every subsequent request by itself. That is the
   * whole reason the mock backend is a real server rather than an interceptor.
   *
   * A failure is left to propagate as the `AppError` the HTTP layer already
   * produced, and the state is untouched: a failed sign-in must not look like
   * a sign-out to anything watching this signal.
   */
  signIn(username: string, password: string): Observable<SessionUser> {
    return this.api.login({ username, password }).pipe(
      map((response) => response.user),
      tap((user) => this.state.set({ status: 'authenticated', user })),
    );
  }
}
