import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, type Route } from '@angular/router';
import { routes } from './app.routes';
import { AppConfigStore } from './core/config/app-config';
import { provideSignedInAs } from './core/testing/session-testing';
import { Logger } from './core/logging/logger';
import { SilentLogger } from './core/testing/http-testing';

/**
 * The route tree itself, exercised as a unit.
 *
 * Nothing is rendered: these tests ask the router to resolve URLs, which is
 * what proves the tree's *shape* - order, redirects, lazy loading, guards and
 * the wildcard. Rendering would pull in the shell, its translations and its
 * breakpoint observer, and would test all of those instead.
 *
 * Every URL here is one a user can type or bookmark, so each of them is also a
 * deep-link test.
 */
describe('application routes', () => {
  function setUp() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        provideSignedInAs('admin'),
        // The customers route starts the realtime sync, which logs.
        { provide: Logger, useClass: SilentLogger },
      ],
    });
    return TestBed.inject(Router);
  }

  /** The route configuration that actually matched, deepest first. */
  function matchedPath(router: Router): string | undefined {
    let snapshot: ActivatedRouteSnapshot | null = router.routerState.snapshot.root;
    let path: string | undefined;
    while (snapshot) {
      path = snapshot.routeConfig?.path ?? path;
      snapshot = snapshot.firstChild;
    }
    return path;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('sends the start URL to the customer list', async () => {
    const router = setUp();
    await router.navigateByUrl('/');

    expect(router.url).toBe('/customers');
  });

  it("keeps Phase 0's /home working rather than 404ing a URL that once existed", async () => {
    const router = setUp();
    await router.navigateByUrl('/home');

    expect(router.url).toBe('/customers');
  });

  it.each([
    '/login',
    '/customers',
    '/customers?page=3&search=nguyen',
    '/customers/new',
    '/customers/c-42',
    '/customers/c-42/edit',
    '/customers/c-42/audit',
    '/technical-labs',
    '/technical-labs/api-connectivity',
    '/technical-labs/offline',
    '/forbidden',
  ])('resolves %s', async (url) => {
    const router = setUp();

    await expect(router.navigateByUrl(url)).resolves.toBe(true);
    expect(router.url).toBe(url);
  });

  it('reads the customer id from the URL rather than from navigation state', async () => {
    const router = setUp();
    await router.navigateByUrl('/customers/c-42/edit');

    let snapshot: ActivatedRouteSnapshot | null = router.routerState.snapshot.root;
    let id: string | undefined;
    while (snapshot) {
      id = snapshot.params['id'] ?? id;
      snapshot = snapshot.firstChild;
    }

    expect(id).toBe('c-42');
  });

  it('answers an unknown URL with the not-found route, inside the shell', async () => {
    const router = setUp();
    await router.navigateByUrl('/this-does-not-exist');

    // Still the URL the user typed: a redirect would lose the address they
    // were trying to reach, which is the first thing to check in a bug report.
    expect(router.url).toBe('/this-does-not-exist');
    expect(matchedPath(router)).toBe('**');
  });

  it('makes the lab area stop existing when its flag is off', async () => {
    const router = setUp();
    TestBed.inject(AppConfigStore).apply({ features: { technicalLabs: false } });

    await router.navigateByUrl('/technical-labs');

    // Not a redirect and not an error page of its own: a disabled feature is
    // indistinguishable from one that was never built.
    expect(matchedPath(router)).toBe('**');
  });

  it('guards both routes that can hold an unsaved form', async () => {
    const router = setUp();

    // The guard is what stands between a half-typed record and a stray click
    // on the navigation. Asserting it on the configuration rather than only in
    // the page's own spec means removing it from one route is caught here.
    for (const url of ['/customers/new', '/customers/c-42/edit']) {
      await router.navigateByUrl(url);
      expect(deepestConfig(router)?.canDeactivate ?? []).toHaveLength(1);
    }

    await router.navigateByUrl('/customers/c-42');
    // The detail page holds nothing unsaved, so guarding it would only train
    // users to click through the dialog.
    expect(deepestConfig(router)?.canDeactivate).toBeUndefined();
  });

  it('asks for the permission to write on the pages that exist only to write', async () => {
    const router = setUp();

    // Asserted on the real tree, so removing a guard from a route is caught
    // here even though the guard's own behaviour is tested elsewhere.
    for (const url of ['/customers/new', '/customers/c-42/edit']) {
      await router.navigateByUrl(url);
      expect(deepestConfig(router)?.canActivate ?? []).toHaveLength(1);
    }

    await router.navigateByUrl('/customers/c-42/audit');
    // Reading is covered once, on the section's parent route.
    expect(deepestConfig(router)?.canActivate).toBeUndefined();
  });

  it('never resolves a route without a title', async () => {
    const router = setUp();

    for (const url of ['/login', '/customers', '/customers/new', '/technical-labs', '/nope']) {
      await router.navigateByUrl(url);
      // Titles are translation keys, so this asserts the key exists - not
      // what it says. `TranslatedTitleStrategy` covers the translation.
      expect(router.routerState.snapshot.root.firstChild).toBeTruthy();
      expect(titleOf(router)).toMatch(/^[a-z]+(\.[A-Za-z]+)+$/);
    }
  });

  /** The configuration of the route that finally matched. */
  function deepestConfig(router: Router): Route | null {
    let snapshot: ActivatedRouteSnapshot | null = router.routerState.snapshot.root;
    let config: Route | null = null;
    while (snapshot) {
      config = snapshot.routeConfig ?? config;
      snapshot = snapshot.firstChild;
    }
    return config;
  }

  function titleOf(router: Router): string {
    let snapshot: ActivatedRouteSnapshot | null = router.routerState.snapshot.root;
    let title: string | undefined;
    while (snapshot) {
      title = snapshot.title ?? title;
      snapshot = snapshot.firstChild;
    }
    return title ?? '';
  }
});
