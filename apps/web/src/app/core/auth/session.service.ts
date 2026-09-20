import { computed, Injectable, signal } from '@angular/core';

/**
 * Authentication seam.
 *
 * Phase 3 implements login, logout, token refresh and expiry. Phase 0 defines
 * the shape they will fill, so that routing, the HTTP layer and later the UI
 * can already depend on "is there a session" without being rewritten when the
 * answer stops being hardcoded.
 *
 * `unknown` is a real state, not a placeholder: before the session has been
 * checked, the app must not decide that the user is anonymous and bounce them
 * to the login page.
 */
export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated';

export interface SessionUser {
  readonly id: string;
  readonly displayName: string;
  readonly roles: readonly string[];
}

interface SessionState {
  readonly status: SessionStatus;
  readonly user: SessionUser | null;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly state = signal<SessionState>({ status: 'unknown', user: null });

  readonly status = computed(() => this.state().status);
  readonly user = computed(() => this.state().user);
  readonly isAuthenticated = computed(() => this.state().status === 'authenticated');
}
