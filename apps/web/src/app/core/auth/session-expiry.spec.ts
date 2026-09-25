import { provideLocationMocks } from '@angular/common/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { provideSignedInAs } from '../testing/session-testing';
import { provideSessionExpiryRedirect } from './session-expiry';
import { SessionService } from './session.service';

@Component({
  selector: 'app-page-stub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class PageStub {}

describe('provideSessionExpiryRedirect', () => {
  let router: Router;
  let session: SessionService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: PageStub },
          { path: 'customers/:id', component: PageStub },
        ]),
        provideLocationMocks(),
        // Its refresh always fails, which is the case under test.
        provideSignedInAs('manager'),
        provideSessionExpiryRedirect(),
      ],
    });
    router = TestBed.inject(Router);
    session = TestBed.inject(SessionService);
    await router.navigateByUrl('/customers/42?tab=audit');
  });

  it('sends the user to sign in, preserving the page they were on', async () => {
    await firstValueFrom(session.refresh()).catch(() => undefined);
    // The navigation is started by the subscriber and settles on the next task.
    await new Promise((resolve) => setTimeout(resolve));

    expect(router.url).toBe('/login?returnUrl=%2Fcustomers%2F42%3Ftab%3Daudit&reason=expired');
    expect(session.status()).toBe('anonymous');
  });

  it('leaves a deliberate sign-out to whoever signed out', async () => {
    await firstValueFrom(session.signOut());
    await new Promise((resolve) => setTimeout(resolve));

    // The shell navigates after signing out; this provider must not race it.
    expect(router.url).toBe('/customers/42?tab=audit');
  });
});
