import { HttpClient } from '@angular/common/http';
import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, type Observable } from 'rxjs';
import { SessionService, type SessionEndReason } from '../auth/session.service';
import { isAppError } from '../errors/app-error';
import { provideTestHttp } from '../testing/http-testing';
import { sessionResponseFor } from '../testing/session-testing';

/**
 * The refresh flow, through the application's real interceptor chain and the
 * real `SessionService`, with only the transport faked.
 *
 * Every test here is about *how many* requests reach the server and in what
 * order, because that is where a refresh implementation goes wrong: a second
 * concurrent refresh presents a rotated token the server has already spent,
 * and the user is signed out for having had two tabs of work in flight.
 */

const SESSION = sessionResponseFor('admin');

const UNAUTHORIZED = { status: 401, statusText: 'Unauthorized' };

describe('authRefreshInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let session: SessionService;
  let ended: SessionEndReason[];

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideTestHttp()] });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);

    ended = [];
    session.ended$.subscribe((reason) => ended.push(reason));

    // Start signed in, the way a user does before their access token expires.
    const signedIn = firstValueFrom(session.signIn('admin', 'irrelevant'));
    backend.expectOne('/api/auth/login').flush(SESSION);
    await signedIn;
  });

  afterEach(() => backend.verify());

  /** Subscribes and collects the outcome, so a test can flush in any order. */
  function track<T>(request: Observable<T>): { value?: T; error?: unknown; done: boolean } {
    const outcome: { value?: T; error?: unknown; done: boolean } = { done: false };
    request.subscribe({
      next: (value) => (outcome.value = value),
      error: (error: unknown) => {
        outcome.error = error;
        outcome.done = true;
      },
      complete: () => (outcome.done = true),
    });
    return outcome;
  }

  function refreshRequests(): TestRequest[] {
    return backend.match('/api/auth/refresh');
  }

  it('renews an expired session and retries the request, invisibly to the caller', () => {
    const result = track(http.get<{ ok: boolean }>('/api/customers'));

    backend.expectOne('/api/customers').flush(null, UNAUTHORIZED);
    backend.expectOne('/api/auth/refresh').flush(SESSION);
    backend.expectOne('/api/customers').flush({ ok: true });

    expect(result.value).toEqual({ ok: true });
    expect(result.error).toBeUndefined();
    expect(session.status()).toBe('authenticated');
  });

  it('sends exactly one refresh for any number of concurrent 401s', () => {
    // Three requests leave together, and all three find the token expired.
    const results = ['/api/customers', '/api/customers/1', '/api/customers/1/audit'].map((url) =>
      track(http.get(url)),
    );

    backend.expectOne('/api/customers').flush(null, UNAUTHORIZED);
    backend.expectOne('/api/customers/1').flush(null, UNAUTHORIZED);
    backend.expectOne('/api/customers/1/audit').flush(null, UNAUTHORIZED);

    // The race this test exists for: one refresh, however many failures.
    const refreshes = refreshRequests();
    expect(refreshes).toHaveLength(1);
    refreshes[0].flush(SESSION);

    // Each original request is retried once, after the single refresh.
    backend.expectOne('/api/customers').flush({ id: 'list' });
    backend.expectOne('/api/customers/1').flush({ id: 'one' });
    backend.expectOne('/api/customers/1/audit').flush({ id: 'audit' });

    expect(results.map((result) => result.value)).toEqual([
      { id: 'list' },
      { id: 'one' },
      { id: 'audit' },
    ]);
  });

  it('retries without refreshing again when the 401 arrives after a refresh finished', () => {
    // Two requests leave with the same, soon-to-expire token.
    const early = track(http.get('/api/early'));
    const late = track(http.get('/api/late'));

    // The first fails and is renewed and retried to completion...
    backend.expectOne('/api/early').flush(null, UNAUTHORIZED);
    backend.expectOne('/api/auth/refresh').flush(SESSION);
    backend.expectOne('/api/early').flush('early');

    // ...and only then does the second one's 401 come back. It is about a
    // token that has already been replaced: refreshing again would present a
    // rotated refresh token, which the server treats as a replay.
    backend.expectOne('/api/late').flush(null, UNAUTHORIZED);
    expect(refreshRequests()).toHaveLength(0);
    backend.expectOne('/api/late').flush('late');

    expect(early.value).toBe('early');
    expect(late.value).toBe('late');
  });

  it('ends the session and hands every caller the original failure when refresh fails', () => {
    const first = track(http.get('/api/customers'));
    const second = track(http.get('/api/customers/2'));

    backend.expectOne('/api/customers').flush(null, UNAUTHORIZED);
    backend.expectOne('/api/customers/2').flush(null, UNAUTHORIZED);
    backend.expectOne('/api/auth/refresh').flush(null, UNAUTHORIZED);

    for (const outcome of [first, second]) {
      expect(isAppError(outcome.error) && outcome.error.kind).toBe('authentication');
    }
    expect(session.status()).toBe('anonymous');
    expect(session.user()).toBeNull();
    // Once, not once per failed request: this is what the redirect listens to.
    expect(ended).toEqual(['expired']);
  });

  it('retries only once - a second 401 is the answer, not a symptom', () => {
    const result = track(http.get('/api/customers'));

    backend.expectOne('/api/customers').flush(null, UNAUTHORIZED);
    backend.expectOne('/api/auth/refresh').flush(SESSION);
    backend.expectOne('/api/customers').flush(null, UNAUTHORIZED);

    expect(refreshRequests()).toHaveLength(0);
    expect(isAppError(result.error) && result.error.kind).toBe('authentication');
  });

  it('never refreshes on behalf of the session endpoints themselves', () => {
    const result = track(session.signIn('admin', 'wrong'));

    backend.expectOne('/api/auth/login').flush(null, UNAUTHORIZED);

    // A refresh interceptor that "recovered" a failed sign-in, or a failed
    // refresh, by refreshing would call itself until the stack ran out.
    expect(refreshRequests()).toHaveLength(0);
    expect(isAppError(result.error) && result.error.kind).toBe('authentication');
    // And a failed sign-in is not a sign-out.
    expect(session.status()).toBe('authenticated');
  });

  it('leaves an authorization failure alone - a new token would not change the answer', () => {
    const result = track(http.delete('/api/customers/1'));

    backend.expectOne('/api/customers/1').flush(null, { status: 403, statusText: 'Forbidden' });

    expect(refreshRequests()).toHaveLength(0);
    expect(isAppError(result.error) && result.error.kind).toBe('authorization');
  });

  it('lets a refresh finish even when the request that started it is cancelled', () => {
    const subscription = http.get('/api/customers').subscribe();
    backend.expectOne('/api/customers').flush(null, UNAUTHORIZED);

    const refresh = backend.expectOne('/api/auth/refresh');
    // The user navigated away. The server has already rotated the refresh
    // token, so the response carrying its replacement must still be read.
    subscription.unsubscribe();
    expect(refresh.cancelled).toBe(false);

    refresh.flush(SESSION);
    expect(session.status()).toBe('authenticated');
  });

  it('does not retry a request the session ended underneath', () => {
    const first = track(http.get('/api/one'));
    const second = track(http.get('/api/two'));

    backend.expectOne('/api/one').flush(null, UNAUTHORIZED);
    backend.expectOne('/api/auth/refresh').flush(null, UNAUTHORIZED);

    // The second 401 arrives after the session was declared over. A retry
    // could only fail the same way, so none is sent.
    backend.expectOne('/api/two').flush(null, UNAUTHORIZED);
    backend.expectNone('/api/two');

    expect(first.done && second.done).toBe(true);
    expect(isAppError(second.error) && second.error.kind).toBe('authentication');
  });
});
