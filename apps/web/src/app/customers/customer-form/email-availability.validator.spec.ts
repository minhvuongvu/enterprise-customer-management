import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CustomerId } from '@ecm/contracts';
import { provideTestHttp } from '../../core/testing/http-testing';
import { CustomerCache } from '../state/customer-cache';
import { CustomerStore } from '../state/customer-store';
import { aCustomer, aPage } from '../testing/customer.fixture';
import { createCustomerForm, type CustomerForm } from './customer-form-model';
import {
  emailAvailabilityValidator,
  EMAIL_CHECK_DEBOUNCE_MS,
} from './email-availability.validator';
import { provideSignedInAs } from '../../core/testing/session-testing';

/**
 * The one rule in this form the client cannot answer by itself.
 *
 * Which makes it the place to prove three things at once: it debounces, it
 * cancels, and a failure to ask does not become a failure to submit.
 */
describe('emailAvailabilityValidator', () => {
  let form: CustomerForm;
  let backend: HttpTestingController;
  let excludeId: CustomerId | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideTestHttp(), provideSignedInAs('admin'), CustomerCache, CustomerStore],
    });
    backend = TestBed.inject(HttpTestingController);
    excludeId = null;

    form = createCustomerForm();
    form.controls.email.addAsyncValidators(
      emailAvailabilityValidator(TestBed.inject(CustomerStore), () => excludeId),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    backend.verify();
  });

  function lookupRequests() {
    return backend.match((request) => request.params.has('search'));
  }

  it('waits for typing to settle before asking', async () => {
    form.controls.email.setValue('a@example.test');
    form.controls.email.setValue('an@example.test');

    await vi.advanceTimersByTimeAsync(EMAIL_CHECK_DEBOUNCE_MS - 50);
    // Nothing yet: one request per keystroke would make the server do the
    // work of a spellchecker.
    expect(lookupRequests()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(100);
    const requests = lookupRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].request.params.get('search')).toBe('an@example.test');
    requests[0].flush(aPage([]));
  });

  it('reports an address that belongs to someone else', async () => {
    form.controls.email.setValue('an@example.test');
    await vi.advanceTimersByTimeAsync(EMAIL_CHECK_DEBOUNCE_MS + 10);

    lookupRequests()[0].flush(aPage([aCustomer()]));
    await vi.advanceTimersByTimeAsync(0);

    expect(form.controls.email.hasError('emailTaken')).toBe(true);
  });

  it('does not report a customer as a clash with itself', async () => {
    const customer = aCustomer();
    excludeId = customer.id;

    form.controls.email.setValue(customer.email);
    await vi.advanceTimersByTimeAsync(EMAIL_CHECK_DEBOUNCE_MS + 10);

    lookupRequests()[0].flush(aPage([customer]));
    await vi.advanceTimersByTimeAsync(0);

    // Editing a customer without changing the email must not fail.
    expect(form.controls.email.valid).toBe(true);
  });

  it('never asks about a value the synchronous validators already rejected', async () => {
    form.controls.email.setValue('not-an-email');
    await vi.advanceTimersByTimeAsync(EMAIL_CHECK_DEBOUNCE_MS + 10);

    // Asking whether "not-an-email" is taken spends a request answering a
    // question the user is already being told about.
    expect(lookupRequests()).toHaveLength(0);
    expect(form.controls.email.hasError('invalidEmail')).toBe(true);
  });

  it('lets the form be submitted when the check itself fails', async () => {
    form.controls.email.setValue('an@example.test');
    await vi.advanceTimersByTimeAsync(EMAIL_CHECK_DEBOUNCE_MS + 10);

    lookupRequests()[0].flush(null, { status: 500, statusText: 'Server Error' });
    await vi.advanceTimersByTimeAsync(0);

    // "I do not know" is the honest answer, and blocking the save because of
    // it would be worse than letting the server decide - which it does.
    expect(form.controls.email.valid).toBe(true);
    expect(form.controls.email.pending).toBe(false);
  });
});
