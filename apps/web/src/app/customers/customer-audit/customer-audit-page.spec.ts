import { provideLocationMocks } from '@angular/common/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTestHttp } from '../../core/testing/http-testing';
import { provideTestTranslations } from '../../core/testing/i18n-testing';
import { CustomerCache } from '../state/customer-cache';
import { CustomerStore } from '../state/customer-store';
import { aCustomer } from '../testing/customer.fixture';
import { CustomerAuditPage } from './customer-audit-page';
import { provideSignedInAs } from '../../core/testing/session-testing';

describe('CustomerAuditPage', () => {
  let backend: HttpTestingController;
  let harness: RouterTestingHarness;
  const customer = aCustomer();

  const entry = {
    id: '44444444-4444-4444-8444-444444444444',
    customerId: customer.id,
    action: 'CUSTOMER_STATUS_CHANGED',
    occurredAt: '2026-01-02T00:00:00.000Z',
    actorId: '11111111-1111-4111-8111-111111111111',
    actorDisplayName: 'Avery Admin',
    changes: [{ field: 'status', previousValue: 'PROSPECT', newValue: 'ACTIVE' }],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [provideTestTranslations()],
      providers: [
        provideTestHttp(),
        provideSignedInAs('admin'),
        provideLocationMocks(),
        provideRouter(
          [
            {
              path: 'customers/:id/audit',
              providers: [CustomerCache, CustomerStore],
              component: CustomerAuditPage,
            },
          ],
          withComponentInputBinding(),
        ),
      ],
    }).compileComponents();

    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  async function open(): Promise<HTMLElement> {
    harness = await RouterTestingHarness.create(`/customers/${customer.id}/audit`);
    return harness.routeNativeElement as HTMLElement;
  }

  it('says what happened in words, not in the enum the API sent', async () => {
    const root = await open();
    backend.expectOne(`/api/customers/${customer.id}/audit`).flush({ items: [entry] });
    harness.detectChanges();

    expect(root.textContent).toContain('Status changed');
    expect(root.textContent).not.toContain('CUSTOMER_STATUS_CHANGED');
    expect(root.textContent).toContain('Avery Admin');
  });

  it('shows the before and the after of every field that changed', async () => {
    const root = await open();
    backend.expectOne(`/api/customers/${customer.id}/audit`).flush({ items: [entry] });
    harness.detectChanges();

    // Values are shown exactly as recorded: formatting them would be guessing
    // at a type the entry does not carry, and would rewrite history the first
    // time a format changed.
    expect(root.textContent).toContain('PROSPECT');
    expect(root.textContent).toContain('ACTIVE');
  });

  it('says nothing has been recorded rather than rendering a blank page', async () => {
    const root = await open();
    backend.expectOne(`/api/customers/${customer.id}/audit`).flush({ items: [] });
    harness.detectChanges();

    expect(root.querySelector('[data-testid="audit-empty"]')).not.toBeNull();
  });

  it('treats a response that is not the envelope as a server failure', async () => {
    const root = await open();
    // A bare array is the shape the contract deliberately does not use.
    backend.expectOne(`/api/customers/${customer.id}/audit`).flush([entry]);
    harness.detectChanges();

    expect(root.querySelector('[data-testid="audit-error"]')).not.toBeNull();
  });

  it('names each changed field in words, and says when a value was withheld', async () => {
    const root = await open();
    backend.expectOne(`/api/customers/${customer.id}/audit`).flush({
      items: [
        {
          ...entry,
          action: 'CUSTOMER_UPDATED',
          changes: [
            { field: 'fullName', previousValue: 'Old Name', newValue: 'New Name', redacted: false },
            { field: 'dateOfBirth', previousValue: null, newValue: null, redacted: true },
          ],
        },
      ],
    });
    harness.detectChanges();

    const changes = Array.from(root.querySelectorAll('[data-testid="audit-change"]')).map(
      (item) => item.textContent ?? '',
    );
    // "Full name", not "fullName"; old and new value for an ordinary field.
    expect(changes[0]).toContain('Full name');
    expect(changes[0]).toContain('Old Name');
    expect(changes[0]).toContain('New Name');
    // The server sent no values for a sensitive field, and the page says so
    // rather than rendering "not provided -> not provided".
    expect(changes[1]).toContain('Date of birth');
    expect(changes[1]).toContain('Changed (value not shown)');
    expect(root.querySelector('[data-testid="audit-redacted"]')).not.toBeNull();
  });
});
