import { computed, inject, Injectable, signal } from '@angular/core';
import type { Permission, SessionResponse, SessionUser } from '@ecm/contracts';
import {
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  Subject,
  tap,
  throwError,
  type Observable,
} from 'rxjs';
import { SessionApi } from '../api/session.api';
import { isAppError } from '../errors/app-error';

/**
 * The client's view of the session: who is signed in, what they may do, and
 * the three things that change that over time - restoring after a reload,
 * renewing when the access token expires, and ending.
 *
 * ## What this class does **not** hold
 *
 * A token. The access and refresh tokens are `HttpOnly` cookies that no script
 * can read, including this one (ADR-0016). What arrives here is the user and
 * the access token's expiry, and what this class decides is only what the UI
 * shows. The server checks the cookie on every request regardless.
 *
 * ## Three states, not two
 *
 * `unknown` is real: before the session has been checked, the app must not
 * conclude that the user is anonymous and bounce them to the login page on
 * every reload. `restore()` is what moves out of it.
 *
 * ## Single flight, twice
 *
 * `restore()` and `refresh()` each keep the observable of the request in
 * flight and hand it to every caller that arrives while it runs. Five guards
 * asking "is there a session" produce one `GET /auth/session`; five requests
 * that all received a 401 produce one `POST /auth/refresh`. The second one is
 * not an optimisation: refresh tokens are rotated on use, so a second
 * concurrent refresh presents a token the first has already spent - and the
 * server, correctly, treats that as a replay and refuses it. ADR-0017.
 */
export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated';

/** Why a session that existed has ended. Drives what the user is told. */
export type SessionEndReason = 'signed-out' | 'expired';

export type { SessionUser };

interface SessionState {
  readonly status: SessionStatus;
  readonly user: SessionUser | null;
  /** When the access cookie stops being accepted. UTC ISO-8601. */
  readonly expiresAt: string | null;
}

const UNKNOWN: SessionState = { status: 'unknown', user: null, expiresAt: null };
const ANONYMOUS: SessionState = { status: 'anonymous', user: null, expiresAt: null };

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(SessionApi);

  private readonly state = signal<SessionState>(UNKNOWN);

  readonly status = computed(() => this.state().status);
  readonly user = computed(() => this.state().user);
  readonly expiresAt = computed(() => this.state().expiresAt);
  readonly isAuthenticated = computed(() => this.state().status === 'authenticated');

  /**
   * What the signed-in user may do, as the **server** derived it.
   *
   * The client never computes permissions from the role, although the matrix
   * is in `@ecm/contracts` and it could: a client that decided its own
   * permissions would be deciding what it is allowed to do. It reads the list
   * the session response carries, and the server checks again on every call.
   */
  private readonly permissions = computed(
    () => new Set<Permission>(this.state().user?.permissions ?? []),
  );

  private readonly ended = new Subject<SessionEndReason>();
  /** Emits when a session that existed ends. Never for "was never signed in". */
  readonly ended$ = this.ended.asObservable();

  /**
   * Bumped whenever the credential the browser holds changes: sign-in,
   * refresh, sign-out, expiry.
   *
   * The refresh interceptor records it when a request leaves and compares it
   * when a 401 comes back. If it moved in between, the 401 is about a
   * credential that has already been replaced, and the right response is to
   * retry - not to refresh a second time. A plain number, not a signal: it is
   * read synchronously inside an interceptor and nothing renders it.
   */
  private generationCounter = 0;

  private restoring: Observable<SessionStatus> | null = null;
  private refreshing: Observable<void> | null = null;

  get generation(): number {
    return this.generationCounter;
  }

  /** UX only. The server enforces the same permission on the request itself. */
  hasPermission(permission: Permission): boolean {
    return this.permissions().has(permission);
  }

  /**
   * Resolves `unknown` into a status, asking the server at most once at a time.
   *
   * Only an `authentication` failure means "anonymous". A network failure or a
   * 500 says nothing about whether the user is signed in, so the state stays
   * `unknown` and the next navigation asks again - rather than treating a
   * server hiccup as a sign-out.
   */
  restore(): Observable<SessionStatus> {
    const status = this.state().status;
    if (status !== 'unknown') {
      return of(status);
    }

    this.restoring ??= this.api.current().pipe(
      tap((response) => this.establish(response)),
      map((): SessionStatus => 'authenticated'),
      catchError((error: unknown) => {
        if (isAppError(error) && error.kind === 'authentication') {
          this.state.set(ANONYMOUS);
          return of<SessionStatus>('anonymous');
        }
        return of<SessionStatus>('unknown');
      }),
      finalize(() => (this.restoring = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.restoring;
  }

  /**
   * Signs in.
   *
   * A failure propagates as the `AppError` the HTTP layer produced and leaves
   * the state untouched: a failed sign-in must not look like a sign-out to
   * anything watching.
   */
  signIn(username: string, password: string): Observable<SessionUser> {
    return this.api.login({ username, password }).pipe(
      tap((response) => this.establish(response)),
      map((response) => response.user),
    );
  }

  /**
   * Signs out: on the server first, then here, whatever the server said.
   *
   * The local half cannot be allowed to fail. A user who pressed "sign out"
   * and is still looking at customer data because the network dropped has
   * been lied to. The honest limit of that: if the request never arrived, the
   * server session outlives this tab until it expires, and the `HttpOnly`
   * cookies - which script cannot delete - still name it. docs/security.md.
   */
  signOut(): Observable<void> {
    return this.api.logout().pipe(
      catchError(() => of(undefined)),
      tap(() => this.end('signed-out')),
    );
  }

  /**
   * Renews the access token, sharing one request among every caller.
   *
   * `refCount: false` is deliberate. If the request that triggered the
   * refresh is cancelled - the user navigated away - the refresh must still
   * finish: the server rotates the refresh token as soon as it receives the
   * request, so abandoning the response would leave the browser holding a
   * token that has already been spent. A refresh, once started, completes.
   *
   * A failure ends the session: there is no second credential to fall back
   * on, and pretending otherwise leaves the user on a page that can no longer
   * load anything.
   */
  refresh(): Observable<void> {
    this.refreshing ??= this.api.refresh().pipe(
      tap((response) => this.establish(response)),
      map(() => undefined),
      catchError((error: unknown) => {
        this.end('expired');
        return throwError(() => error);
      }),
      finalize(() => (this.refreshing = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refreshing;
  }

  /**
   * Makes the credential usable again for a request sent at `sentAt`.
   *
   * If the generation moved since then, someone already renewed it - the
   * request lost a race with a refresh that finished while it was in flight -
   * and there is nothing to do but retry. Unless the change was the session
   * *ending*: then a retry can only fail the same way, so it is not sent.
   * Otherwise this joins or starts the single refresh.
   */
  renewAfter(sentAt: number): Observable<void> {
    if (this.generationCounter === sentAt) {
      return this.refresh();
    }
    return this.state().status === 'authenticated'
      ? of(undefined)
      : throwError(() => new Error('The session ended while this request was in flight.'));
  }

  private establish(response: SessionResponse): void {
    this.generationCounter += 1;
    this.state.set({
      status: 'authenticated',
      user: response.user,
      expiresAt: response.expiresAt,
    });
  }

  private end(reason: SessionEndReason): void {
    const hadSession = this.state().status === 'authenticated';
    this.generationCounter += 1;
    this.state.set(ANONYMOUS);
    if (hadSession) {
      this.ended.next(reason);
    }
  }
}
