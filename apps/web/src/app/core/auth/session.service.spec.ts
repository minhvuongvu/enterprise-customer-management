import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { provideTestHttp } from '../testing/http-testing';
import { sessionResponseFor } from '../testing/session-testing';
import { SessionService, type SessionEndReason, type SessionStatus } from './session.service';

const MANAGER = sessionResponseFor('manager');

describe('SessionService', () => {
  let session: SessionService;
  let backend: HttpTestingController;
  let ended: SessionEndReason[];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestHttp()] });
    session = TestBed.inject(SessionService);
    backend = TestBed.inject(HttpTestingController);
    ended = [];
    session.ended$.subscribe((reason) => ended.push(reason));
  });

  afterEach(() => backend.verify());

  it('starts in "unknown", not "anonymous"', () => {
    // The distinction matters: treating "not checked yet" as "signed out"
    // bounces a signed-in user to the login page on every reload.
    expect(session.status()).toBe('unknown');
    expect(session.isAuthenticated()).toBe(false);
    expect(session.user()).toBeNull();
  });

  describe('login', () => {
    it('records the user, their expiry and the permissions the server gave them', async () => {
      const signedIn = firstValueFrom(session.signIn('manager', 'irrelevant'));
      const request = backend.expectOne('/api/auth/login');
      expect(request.request.body).toEqual({ username: 'manager', password: 'irrelevant' });
      request.flush(MANAGER);

      expect((await signedIn).displayName).toBe('Morgan Manager');
      expect(session.status()).toBe('authenticated');
      expect(session.expiresAt()).toBe(MANAGER.expiresAt);
      expect(session.hasPermission('CUSTOMER_UPDATE')).toBe(true);
      // Read from the response, not computed from the role.
      expect(session.hasPermission('CUSTOMER_DELETE')).toBe(false);
    });

    it('leaves the state alone when sign-in fails', async () => {
      const failed = firstValueFrom(session.signIn('manager', 'x')).catch(
        (error: unknown) => error,
      );
      backend.expectOne('/api/auth/login').flush(null, { status: 401, statusText: 'Unauthorized' });
      await failed;

      // Still unknown: a failed sign-in is not evidence of anything else.
      expect(session.status()).toBe('unknown');
      expect(ended).toEqual([]);
    });
  });

  describe('logout', () => {
    async function signIn(): Promise<void> {
      const signedIn = firstValueFrom(session.signIn('manager', 'x'));
      backend.expectOne('/api/auth/login').flush(MANAGER);
      await signedIn;
    }

    it('ends the session on the server, then here', async () => {
      await signIn();

      const signedOut = firstValueFrom(session.signOut());
      backend
        .expectOne({ method: 'POST', url: '/api/auth/logout' })
        .flush(null, { status: 204, statusText: 'No Content' });
      await signedOut;

      expect(session.status()).toBe('anonymous');
      expect(session.user()).toBeNull();
      expect(session.hasPermission('CUSTOMER_READ')).toBe(false);
      expect(ended).toEqual(['signed-out']);
    });

    it('still signs out locally when the server cannot be reached', async () => {
      await signIn();

      const signedOut = firstValueFrom(session.signOut());
      backend.expectOne('/api/auth/logout').error(new ProgressEvent('error'));
      await signedOut;

      // A user who pressed "sign out" must not be left looking at data.
      expect(session.status()).toBe('anonymous');
    });
  });

  describe('restore', () => {
    it('asks the server once, however many callers ask at the same time', async () => {
      const answers = Promise.all([
        firstValueFrom(session.restore()),
        firstValueFrom(session.restore()),
        firstValueFrom(session.restore()),
      ]);

      backend.expectOne('/api/auth/session').flush(MANAGER);

      expect(await answers).toEqual(['authenticated', 'authenticated', 'authenticated']);
      expect(session.user()?.username).toBe('manager');
    });

    it('does not ask again once the answer is known', async () => {
      const first = firstValueFrom(session.restore());
      backend.expectOne('/api/auth/session').flush(MANAGER);
      await first;

      expect(await firstValueFrom(session.restore())).toBe('authenticated');
      backend.expectNone('/api/auth/session');
    });

    it('survives a reload after the access token expired, by refreshing', async () => {
      const restored = firstValueFrom(session.restore());

      // The access cookie is dead, the refresh cookie is not.
      backend
        .expectOne('/api/auth/session')
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      backend.expectOne('/api/auth/refresh').flush(MANAGER);
      backend.expectOne('/api/auth/session').flush(MANAGER);

      expect(await restored).toBe('authenticated');
    });

    it('settles on anonymous when there is no session to restore', async () => {
      const restored = firstValueFrom(session.restore());

      backend
        .expectOne('/api/auth/session')
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      backend
        .expectOne('/api/auth/refresh')
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(await restored).toBe<SessionStatus>('anonymous');
      // Nobody was signed in, so nothing "ended" - no redirect should fire.
      expect(ended).toEqual([]);
    });

    it('stays unknown when the server fails, rather than treating it as a sign-out', async () => {
      const restored = firstValueFrom(session.restore());
      backend
        .expectOne('/api/auth/session')
        .flush(null, { status: 503, statusText: 'Unavailable' });

      expect(await restored).toBe<SessionStatus>('unknown');

      // And the next caller asks again rather than trusting a stale failure.
      const again = firstValueFrom(session.restore());
      backend.expectOne('/api/auth/session').flush(MANAGER);
      expect(await again).toBe('authenticated');
    });
  });
});
