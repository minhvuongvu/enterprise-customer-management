import { provideLocationMocks } from '@angular/common/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { isAppError } from '../core/errors/app-error';
import { provideTestHttp } from '../core/testing/http-testing';
import { provideTestTranslations } from '../core/testing/i18n-testing';
import { provideSignedInAs, type FixtureUsername } from '../core/testing/session-testing';
import { CustomerDetailPage } from './customer-detail/customer-detail-page';
import { CustomerListPage } from './customer-list/customer-list-page';
import { CustomerCache } from './state/customer-cache';
import { CustomerStore } from './state/customer-store';
import { aCustomer, aPage } from './testing/customer.fixture';

/**
 * UI and action authorization in the customer feature, per role.
 *
 * Route authorization is proven in `core/auth/guards.spec.ts`; this file is
 * about what a user who *is* allowed onto a page can see and do there. The
 * cases are the ones the role matrix makes interesting: a viewer who can only
 * read, and a manager who can change records but not destroy them.
 *
 * None of this is what protects the data. `apps/mock-api/test/authorization
 * .spec.ts` proves the server refuses the same actions with no UI involved.
 */
describe('customer authorization', () => {
  let backend: HttpTestingController;
  let harness: RouterTestingHarness;
  const customer = aCustomer();

  async function signInAs(username: FixtureUsername): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [provideTestTranslations()],
      providers: [
        provideTestHttp(),
        provideSignedInAs(username),
        provideLocationMocks(),
        provideRouter(
          [
            {
              path: 'customers',
              providers: [CustomerCache, CustomerStore],
              children: [
                { path: '', component: CustomerListPage },
                { path: ':id', component: CustomerDetailPage },
              ],
            },
          ],
          withComponentInputBinding(),
        ),
      ],
    }).compileComponents();
    backend = TestBed.inject(HttpTestingController);
  }

  afterEach(() => backend.verify());

  async function openList(): Promise<HTMLElement> {
    harness = await RouterTestingHarness.create('/customers');
    backend.expectOne((request) => request.url === '/api/customers').flush(aPage([customer]));
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  async function openDetail(): Promise<HTMLElement> {
    harness = await RouterTestingHarness.create(`/customers/${customer.id}`);
    backend.expectOne(`/api/customers/${customer.id}`).flush(customer);
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  function actionLabels(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll('[pageActions] a, [pageActions] button')).map(
      (element) => element.textContent?.trim() ?? '',
    );
  }

  describe('as a viewer', () => {
    beforeEach(() => signInAs('viewer'));

    it('offers no way to create, and no selection to act on', async () => {
      const root = await openList();

      // The positive half keeps the negative honest: a selector that matched
      // nothing would "not contain" anything.
      expect(actionLabels(root)).toContain('Refresh');
      expect(actionLabels(root)).not.toContain('New customer');
      // Selecting rows is only useful to someone who can do something with
      // them, so the checkboxes are not there at all.
      expect(root.querySelector('input[type="checkbox"]')).toBeNull();
      // Reading is what a viewer is for: the rows are still there.
      expect(root.textContent).toContain(customer.fullName);
    });

    it('can open a record, but is offered neither edit nor delete', async () => {
      const root = await openDetail();

      const actions = actionLabels(root);
      expect(actions).toContain('Audit trail');
      expect(actions).not.toContain('Edit');
      expect(actions).not.toContain('Delete');
    });
  });

  describe('as a manager', () => {
    beforeEach(() => signInAs('manager'));

    it('is offered edit and not delete - the gap in the role matrix, made visible', async () => {
      const root = await openDetail();

      const actions = actionLabels(root);
      expect(actions).toContain('Edit');
      expect(actions).not.toContain('Delete');
    });

    it('gets bulk activate and deactivate, but not bulk delete', async () => {
      const root = await openList();

      root.querySelector<HTMLInputElement>('tbody input[type="checkbox"]')?.click();
      harness.detectChanges();

      expect(root.querySelector('[data-testid="bulk-activate"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="bulk-deactivate"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="bulk-delete"]')).toBeNull();
    });

    it('is refused a delete by the store itself, before any request is sent', async () => {
      // Action authorization: whichever control asked for it - a hidden
      // button, a shortcut, a future menu - the action refuses. The
      // `backend.verify()` in afterEach proves no DELETE left the browser.
      await openList();

      const error = await firstValueFrom(routeStore().remove(customer.id)).catch(
        (failure: unknown) => failure,
      );

      expect(isAppError(error) && error.kind).toBe('authorization');
    });
  });

  /** The store the customers route provided, reached through the rendered page. */
  function routeStore(): CustomerStore {
    const page = harness.routeDebugElement;
    if (!page) {
      throw new Error('No page is rendered.');
    }
    return page.injector.get(CustomerStore);
  }
});
