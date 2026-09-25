import { provideLocationMocks } from '@angular/common/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTestHttp } from '../../core/testing/http-testing';
import { provideTestTranslations } from '../../core/testing/i18n-testing';
import { CustomerCache } from '../state/customer-cache';
import { CustomerStore } from '../state/customer-store';
import { aCustomer, aPage } from '../testing/customer.fixture';
import { CustomerFormPage } from './customer-form-page';
import { EMAIL_CHECK_DEBOUNCE_MS } from './email-availability.validator';
import { unsavedChangesGuard } from './unsaved-changes.guard';
import { provideSignedInAs } from '../../core/testing/session-testing';
import { ConfirmationService } from '../../core/notifications/confirmation.service';

@Component({
  selector: 'app-stub-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class StubPage {}

/**
 * The form, driven through the DOM and the router.
 *
 * The asynchronous email check is part of every path here, because it is part
 * of every path in the application: a form whose email control is still
 * `PENDING` cannot be submitted, and a test that bypassed the validator would
 * be testing a form that does not exist.
 */
describe('CustomerFormPage', () => {
  let backend: HttpTestingController;
  let harness: RouterTestingHarness;
  const customer = aCustomer();

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [provideTestTranslations()],
      providers: [
        provideTestHttp(),
        provideSignedInAs('admin'),
        provideLocationMocks(),
        provideRouter(
          [
            { path: 'customers', pathMatch: 'full', component: StubPage },
            {
              path: 'customers/new',
              providers: [CustomerCache, CustomerStore],
              data: { mode: 'create' },
              component: CustomerFormPage,
            },
            {
              path: 'customers/:id',
              pathMatch: 'full',
              component: StubPage,
            },
            {
              path: 'customers/:id/edit',
              providers: [CustomerCache, CustomerStore],
              data: { mode: 'edit' },
              // The same guard the feature's routes declare; that the real
              // route config carries it is asserted in app.routes.spec.ts.
              canDeactivate: [unsavedChangesGuard],
              component: CustomerFormPage,
            },
          ],
          withComponentInputBinding(),
        ),
      ],
    }).compileComponents();

    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    backend.verify();
  });

  async function open(url: string): Promise<HTMLElement> {
    harness = await RouterTestingHarness.create(url);
    return harness.routeNativeElement as HTMLElement;
  }

  function field(root: HTMLElement, label: string): HTMLInputElement {
    const labels = Array.from(root.querySelectorAll('label'));
    const match = labels.find((candidate) => candidate.textContent?.trim().startsWith(label));
    const control = match && root.querySelector(`#${match.getAttribute('for')}`);
    if (!control) {
      throw new Error(`No field labelled "${label}"`);
    }
    return control as HTMLInputElement;
  }

  function type(root: HTMLElement, label: string, value: string): void {
    const input = field(root, label);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
  }

  function testId<T extends HTMLElement>(root: HTMLElement, id: string): T | null {
    return root.querySelector<T>(`[data-testid="${id}"]`);
  }

  /**
   * Submits the form.
   *
   * The submit event is dispatched rather than the button clicked, because
   * jsdom does not implement form submission from a button - it logs "Not
   * implemented: HTMLFormElement's requestSubmit()" and nothing happens. In a
   * real browser the button does this by itself, which is what the E2E suite
   * checks.
   */
  function save(root: HTMLElement): void {
    root.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    harness.detectChanges();
  }

  /** Lets the async email validator run and answers it. */
  async function settleEmailCheck(taken: readonly unknown[] = []): Promise<void> {
    await vi.advanceTimersByTimeAsync(EMAIL_CHECK_DEBOUNCE_MS + 10);
    backend
      .expectOne((request) => request.url === '/api/customers' && request.params.has('search'))
      .flush(aPage(taken as never));
    harness.detectChanges();
  }

  describe('creating', () => {
    it('refuses to submit an incomplete form and marks what is missing', async () => {
      const root = await open('/customers/new');

      save(root);

      // No request: `verify` in afterEach is the assertion.
      expect(root.textContent).toContain('This field is required.');
      expect(testId(root, 'submit-error')).toBeNull();
    });

    it('enforces the cross-field rule before the server ever sees it', async () => {
      const root = await open('/customers/new');
      type(root, 'Full name', 'Nguyễn Văn A');
      type(root, 'Email', 'an@example.test');
      await settleEmailCheck();

      const status = root.querySelectorAll('select')[1];
      status.value = 'ACTIVE';
      status.dispatchEvent(new Event('change'));
      harness.detectChanges();

      save(root);

      expect(testId(root, 'cross-field-error')?.textContent).toContain(
        'An active customer needs a phone number',
      );
    });

    it('waits for the asynchronous check rather than ignoring the press', async () => {
      const root = await open('/customers/new');
      type(root, 'Full name', 'Nguyễn Văn A');
      type(root, 'Email', 'an@example.test');

      // Pressed while the email check is still in flight, which is easy to do:
      // the check waits for typing to settle. Doing nothing here would read as
      // a broken button.
      save(root);
      expect(testId<HTMLElement>(root, 'save')?.querySelector('button')?.disabled).toBe(true);

      await settleEmailCheck();

      backend.expectOne((candidate) => candidate.method === 'POST').flush(customer);
      await vi.advanceTimersByTimeAsync(0);
    });

    it('posts the customer and goes to the record it created', async () => {
      const root = await open('/customers/new');
      type(root, 'Full name', 'Nguyễn Văn A');
      type(root, 'Email', 'an@example.test');
      await settleEmailCheck();

      save(root);

      const request = backend.expectOne(
        (candidate) => candidate.url === '/api/customers' && candidate.method === 'POST',
      );
      expect(request.request.body).toMatchObject({
        fullName: 'Nguyễn Văn A',
        email: 'an@example.test',
        phone: null,
      });
      request.flush(customer);

      await vi.advanceTimersByTimeAsync(0);
      expect(TestBed.inject(Router).url).toBe(`/customers/${customer.id}`);
    });

    it('marks the field a 422 names, without showing the server sentence', async () => {
      const root = await open('/customers/new');
      type(root, 'Full name', 'Nguyễn Văn A');
      type(root, 'Email', 'an@example.test');
      await settleEmailCheck();

      save(root);
      backend
        .expectOne((candidate) => candidate.method === 'POST')
        .flush(
          {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Invalid customer',
              correlationId: 'test',
              details: {
                fieldErrors: { fullName: ['String must contain at most 150 character(s)'] },
              },
            },
          },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
      harness.detectChanges();

      expect(root.textContent).toContain('The server rejected this value.');
      // The envelope's own message is developer-facing and cannot be
      // translated, so it never reaches the page.
      expect(root.textContent).not.toContain('String must contain');
    });

    it('reads a conflict with no version as a duplicate email', async () => {
      const root = await open('/customers/new');
      type(root, 'Full name', 'Nguyễn Văn A');
      type(root, 'Email', 'an@example.test');
      await settleEmailCheck();

      save(root);
      backend
        .expectOne((candidate) => candidate.method === 'POST')
        .flush(
          {
            error: { code: 'CONFLICT', message: 'Email exists', correlationId: 'test' },
          },
          { status: 409, statusText: 'Conflict' },
        );
      harness.detectChanges();

      // Same status code as a stale write; the absence of `currentVersion` is
      // what tells the two apart.
      expect(root.textContent).toContain('Another customer already uses this email address.');
    });
  });

  describe('editing', () => {
    async function openEdit(): Promise<HTMLElement> {
      const root = await open(`/customers/${customer.id}/edit`);
      backend.expectOne(`/api/customers/${customer.id}`).flush(customer);
      harness.detectChanges();
      // Filling the form changes the email, which starts the availability
      // check. Until it answers the control is PENDING and the form cannot be
      // submitted - exactly as in the application.
      await settleEmailCheck([customer]);
      return root;
    }

    it('fills the form from the record', async () => {
      const root = await openEdit();

      expect(field(root, 'Full name').value).toBe(customer.fullName);
      expect(field(root, 'Email').value).toBe(customer.email);
      expect(field(root, 'Tags').value).toBe('vip');
    });

    it('sends only what changed, with the version it was filled from', async () => {
      const root = await openEdit();
      type(root, 'Full name', 'Nguyễn Văn B');

      save(root);

      const request = backend.expectOne(`/api/customers/${customer.id}`);
      expect(request.request.method).toBe('PATCH');
      // Not a full record: a PUT here would overwrite fields this form never
      // showed with values it read minutes ago.
      expect(request.request.body).toEqual({
        fullName: 'Nguyễn Văn B',
        version: customer.version,
      });

      request.flush(aCustomer({ fullName: 'Nguyễn Văn B', version: 2 }));
      await vi.advanceTimersByTimeAsync(0);
      expect(TestBed.inject(Router).url).toBe(`/customers/${customer.id}`);
    });

    it('does not send an empty PATCH when nothing was edited', async () => {
      const root = await openEdit();

      save(root);

      // An empty update would still bump the version and write an audit entry
      // saying nobody did anything.
      await vi.advanceTimersByTimeAsync(0);
      expect(TestBed.inject(Router).url).toBe(`/customers/${customer.id}`);
    });

    it('offers to reload, and keeps the typing, when someone else got there first', async () => {
      const root = await openEdit();
      type(root, 'Full name', 'Nguyễn Văn B');

      save(root);
      backend.expectOne(`/api/customers/${customer.id}`).flush(
        {
          error: {
            code: 'CONFLICT',
            message: 'Modified by someone else',
            correlationId: 'test',
            details: { currentVersion: 5 },
          },
        },
        { status: 409, statusText: 'Conflict' },
      );
      harness.detectChanges();

      expect(testId(root, 'conflict')).not.toBeNull();

      // Reloading must not discard the edit - that is the whole point of
      // offering it rather than forcing the write.
      testId<HTMLElement>(root, 'conflict')?.querySelector('button')?.click();
      harness.detectChanges();
      backend
        .expectOne(`/api/customers/${customer.id}`)
        .flush(aCustomer({ fullName: 'Changed by someone else', version: 5 }));
      harness.detectChanges();

      expect(field(root, 'Full name').value).toBe('Nguyễn Văn B');
      expect(testId(root, 'reloaded-notice')).not.toBeNull();

      // Saving again is computed against the record that just arrived, so the
      // other person's change to a different field survives.
      save(root);
      const retry = backend.expectOne(`/api/customers/${customer.id}`);
      expect(retry.request.body).toEqual({ fullName: 'Nguyễn Văn B', version: 5 });
      retry.flush(aCustomer({ fullName: 'Nguyễn Văn B', version: 6 }));
      await vi.advanceTimersByTimeAsync(0);
    });

    it('asks before discarding unsaved changes, and stays when told to', async () => {
      const root = await openEdit();
      type(root, 'Full name', 'Nguyễn Văn B');

      const leaving = TestBed.inject(Router).navigateByUrl('/customers');
      // Not `whenStable`: the navigation is deliberately unfinished - it is
      // waiting for the user to answer the dialog.
      await vi.advanceTimersByTimeAsync(0);
      harness.detectChanges();

      // The question goes to the shared confirmation, which the shell renders.
      const confirmation = TestBed.inject(ConfirmationService);
      expect(confirmation.pending()?.request.headingKey).toBe('pages.customers.form.leaveHeading');
      expect(confirmation.pending()?.request.cancelKey).toBe('pages.customers.form.stay');

      confirmation.answer(false);
      harness.detectChanges();

      expect(await leaving).toBe(false);
      expect(TestBed.inject(Router).url).toContain('/edit');
    });

    it('leaves without asking when nothing was typed', async () => {
      await openEdit();

      // A guard that interrupts a user who changed nothing is a guard people
      // learn to click through.
      expect(await TestBed.inject(Router).navigateByUrl('/customers')).toBe(true);
    });
  });
});
