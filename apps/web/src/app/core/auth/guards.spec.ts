import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideSignedInAs, sessionResponseFor } from '../testing/session-testing';
import { SessionApi } from '../api/session.api';
import { authGuard } from './auth.guard';
import { FORBIDDEN_PATH, requirePermission } from './permission.guard';
import { of, throwError } from 'rxjs';
import { appError } from '../errors/app-error';

@Component({
  selector: 'app-page-stub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class PageStub {}

@Component({
  selector: 'app-forbidden-stub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<p data-testid="forbidden">forbidden</p>',
})
class ForbiddenStub {}

/**
 * The two guards, through a real router.
 *
 * The route table mirrors the application's shape - `authGuard` once on the
 * parent, `requirePermission` on the pages that need more than reading - so
 * what is proven is how they combine, not only what each returns.
 */
const ROUTES = [
  { path: 'login', component: PageStub },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: FORBIDDEN_PATH.slice(1), component: ForbiddenStub },
      {
        path: 'customers',
        canActivate: [requirePermission('CUSTOMER_READ')],
        children: [
          { path: '', component: PageStub },
          {
            path: 'new',
            canActivate: [requirePermission('CUSTOMER_CREATE')],
            component: PageStub,
          },
        ],
      },
    ],
  },
];

describe('route guards', () => {
  afterEach(() => TestBed.resetTestingModule());

  function configure(providers: unknown[]): Router {
    TestBed.configureTestingModule({
      providers: [provideRouter(ROUTES), provideLocationMocks(), ...(providers as [])],
    });
    return TestBed.inject(Router);
  }

  /** A server with no session: /auth/session and /auth/refresh both say 401. */
  const anonymous = {
    provide: SessionApi,
    useValue: {
      current: () => throwError(() => appError('authentication')),
      refresh: () => throwError(() => appError('authentication')),
    },
  };

  describe('authGuard', () => {
    it('sends a visitor with no session to sign in, keeping where they were going', async () => {
      const router = configure([anonymous]);

      await router.navigateByUrl('/customers/new?draft=1');

      expect(router.url).toBe('/login?returnUrl=%2Fcustomers%2Fnew%3Fdraft%3D1');
    });

    it('lets a signed-in user through', async () => {
      const router = configure([provideSignedInAs('viewer')]);

      await router.navigateByUrl('/customers');

      expect(router.url).toBe('/customers');
    });

    it('waits for the session to be restored rather than assuming the worst', async () => {
      // A reload: nothing is known until the server answers. The guard must
      // ask, not treat "unknown" as "anonymous".
      let asked = 0;
      const router = configure([
        {
          provide: SessionApi,
          useValue: {
            current: () => {
              asked += 1;
              return of(sessionResponseFor('admin'));
            },
          },
        },
      ]);

      await router.navigateByUrl('/customers/new');

      expect(router.url).toBe('/customers/new');
      // Three guards on the way down, one question to the server.
      expect(asked).toBe(1);
    });
  });

  describe('requirePermission', () => {
    it('shows "not permitted" in place of a route the role does not allow', async () => {
      const router = configure([provideSignedInAs('viewer')]);
      const harness = await RouterTestingHarness.create();

      await harness.navigateByUrl('/customers/new');

      // The address bar still shows the URL the user asked for - the router's
      // internal state is the forbidden page, the Location is not...
      expect(router.url).toBe(FORBIDDEN_PATH);
      expect(TestBed.inject(Location).path()).toBe('/customers/new');
      // ...and what is on screen is the refusal.
      expect(
        (harness.routeNativeElement as HTMLElement).querySelector('[data-testid="forbidden"]'),
      ).not.toBeNull();
    });

    it('allows the same route to a role that holds the permission', async () => {
      const router = configure([provideSignedInAs('manager')]);

      await router.navigateByUrl('/customers/new');

      expect(router.url).toBe('/customers/new');
    });
  });
});
