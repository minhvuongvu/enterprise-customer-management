import { provideLocationMocks } from '@angular/common/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SessionService } from '../core/auth/session.service';
import { Logger } from '../core/logging/logger';
import { provideTestHttp, SilentLogger } from '../core/testing/http-testing';
import { provideTestTranslations } from '../core/testing/i18n-testing';
import { sessionResponseFor } from '../core/testing/session-testing';
import { LoginPage, readTypedValues } from './login-page';

@Component({
  selector: 'app-page-stub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class PageStub {}

/**
 * The sign-in page, against the real session service and HTTP chain.
 *
 * Form submission is dispatched as a `submit` event: jsdom does not implement
 * submitting a form from its button (PROGRESS.md, Phase 2 findings).
 */
describe('LoginPage', () => {
  let backend: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [provideTestTranslations()],
      providers: [
        provideTestHttp(),
        provideLocationMocks(),
        provideRouter(
          [
            { path: 'login', component: LoginPage },
            { path: 'customers', component: PageStub },
            { path: 'customers/:id', component: PageStub },
          ],
          withComponentInputBinding(),
        ),
      ],
    }).compileComponents();
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  async function open(url: string): Promise<HTMLElement> {
    harness = await RouterTestingHarness.create(url);
    // `afterNextRender` enables the form; the harness has rendered once.
    await harness.fixture.whenStable();
    return harness.routeNativeElement as HTMLElement;
  }

  function fillAndSubmit(root: HTMLElement, username: string, password: string): void {
    const [user, pass] = Array.from(root.querySelectorAll<HTMLInputElement>('input'));
    user.value = username;
    user.dispatchEvent(new Event('input'));
    pass.value = password;
    pass.dispatchEvent(new Event('input'));
    root.querySelector('form')?.dispatchEvent(new Event('submit'));
    harness.detectChanges();
  }

  it('signs in and returns the user to the page they were sent from', async () => {
    const root = await open('/login?returnUrl=%2Fcustomers%2F42%3Ftab%3Daudit');

    fillAndSubmit(root, 'manager', 'anything');
    backend.expectOne('/api/auth/login').flush(sessionResponseFor('manager'));
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/customers/42?tab=audit');
    expect(TestBed.inject(SessionService).user()?.role).toBe('MANAGER');
  });

  it('refuses to follow a return URL that leaves the application', async () => {
    const root = await open('/login?returnUrl=https%3A%2F%2Fevil.test%2Flogin');

    fillAndSubmit(root, 'admin', 'anything');
    backend.expectOne('/api/auth/login').flush(sessionResponseFor('admin'));
    await harness.fixture.whenStable();

    // An open redirect would hand a freshly signed-in user to a look-alike.
    expect(TestBed.inject(Router).url).toBe('/customers');
  });

  it('says the credentials were not accepted, without saying which part was wrong', async () => {
    const root = await open('/login');

    fillAndSubmit(root, 'nobody', 'anything');
    backend.expectOne('/api/auth/login').flush(
      {
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Invalid username or password.',
          correlationId: 'x',
        },
      },
      { status: 401, statusText: 'Unauthorized' },
    );
    harness.detectChanges();

    expect(root.querySelector('[data-testid="login-error"]')?.textContent).toContain(
      'were not accepted',
    );
    // The server's own sentence is for developers, never for the page.
    expect(root.textContent).not.toContain('Invalid username or password.');
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('explains why the user is here when their session ended', async () => {
    const root = await open('/login?returnUrl=%2Fcustomers&reason=expired');

    expect(root.querySelector('[data-testid="session-expired"]')?.textContent).toContain(
      'Your session has ended',
    );
  });

  it('says so when another tab signed out, rather than calling it an expiry', async () => {
    const root = await open('/login?returnUrl=%2Fcustomers&reason=signed-out-elsewhere');

    expect(root.querySelector('[data-testid="signed-out-elsewhere"]')?.textContent).toContain(
      'You signed out in another tab',
    );
    expect(root.querySelector('[data-testid="session-expired"]')).toBeNull();
  });

  it('keeps the password out of the request URL and out of the logs', async () => {
    const root = await open('/login');

    fillAndSubmit(root, 'admin', 'value-that-must-not-leak');
    const request = backend.expectOne('/api/auth/login');

    // In the body of a POST - never a query string, which ends up in history,
    // proxy logs and the Referer header.
    expect(request.request.method).toBe('POST');
    expect(request.request.urlWithParams).not.toContain('value-that-must-not-leak');
    request.flush(sessionResponseFor('admin'));
    await harness.fixture.whenStable();

    // Every request is logged; none of those lines may carry the credential.
    const logger = TestBed.inject(Logger) as SilentLogger;
    expect(logger.entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(logger.entries)).not.toContain('value-that-must-not-leak');
  });
});

describe('readTypedValues', () => {
  it('reads what was typed into the prerendered form, and empty when there is no form yet', () => {
    const host = document.createElement('app-login-page');
    for (const name of ['username', 'password']) {
      const input = document.createElement('input');
      input.name = name;
      host.append(input);
    }
    document.body.append(host);
    host.querySelector<HTMLInputElement>('input[name="username"]')!.value = 'adm';

    expect(readTypedValues(document)).toEqual({ username: 'adm', password: '' });

    host.remove();
    expect(readTypedValues(document)).toEqual({ username: '', password: '' });
  });
});
