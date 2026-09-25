import { provideLocationMocks } from '@angular/common/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import type { DateOnly } from '@ecm/contracts';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTestHttp } from '../../core/testing/http-testing';
import { provideTestTranslations } from '../../core/testing/i18n-testing';
import { CustomerCache } from '../state/customer-cache';
import { CustomerStore } from '../state/customer-store';
import { aCustomer } from '../testing/customer.fixture';
import { CustomerDetailPage } from './customer-detail-page';
import { provideSignedInAs } from '../../core/testing/session-testing';

@Component({
  selector: 'app-list-stub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class ListStub {}

describe('CustomerDetailPage', () => {
  let backend: HttpTestingController;
  let harness: RouterTestingHarness;
  const customer = aCustomer();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [provideTestTranslations()],
      providers: [
        provideTestHttp(),
        provideSignedInAs('admin'),
        provideLocationMocks(),
        provideRouter(
          [
            { path: 'customers', pathMatch: 'full', component: ListStub },
            {
              path: 'customers/:id',
              providers: [CustomerCache, CustomerStore],
              component: CustomerDetailPage,
            },
          ],
          withComponentInputBinding(),
        ),
      ],
    }).compileComponents();

    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  async function open(id: string = customer.id): Promise<HTMLElement> {
    harness = await RouterTestingHarness.create(`/customers/${id}`);
    return harness.routeNativeElement as HTMLElement;
  }

  function testId<T extends HTMLElement>(root: HTMLElement, id: string): T | null {
    return root.querySelector<T>(`[data-testid="${id}"]`);
  }

  it('answers a malformed identifier without asking the server', async () => {
    const root = await open('not-a-uuid');

    // `verify` in afterEach proves no request was made: a URL that cannot
    // name a customer was never going to find one.
    expect(testId(root, 'detail-not-found')).not.toBeNull();
  });

  it('renders what is known about the customer', async () => {
    const root = await open();
    backend.expectOne(`/api/customers/${customer.id}`).flush(customer);
    harness.detectChanges();

    expect(root.textContent).toContain('Nguyễn Văn A');
    expect(testId(root, 'customer-code')?.textContent).toContain('C-000001');
    expect(root.textContent).toContain('Active');
  });

  it('renders a date of birth without letting a timezone move it', async () => {
    const root = await open();
    backend
      .expectOne(`/api/customers/${customer.id}`)
      .flush(aCustomer({ dateOfBirth: '1990-01-01' as DateOnly }));
    harness.detectChanges();

    // The bug this guards against renders 31 December 1989 west of UTC.
    expect(root.textContent).toContain('1990');
    expect(root.textContent).not.toContain('1989');
  });

  it('renders markup in a customer record as text, never as markup', async () => {
    const root = await open();
    // Anyone who can create a customer chooses what this field contains, and
    // everyone who opens the record renders it.
    backend
      .expectOne(`/api/customers/${customer.id}`)
      .flush(aCustomer({ fullName: '<img src=x onerror="alert(1)">' }));
    harness.detectChanges();

    // Interpolation escapes: the characters are on screen, and no element was
    // created from them.
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('h1')?.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it('says a customer does not exist rather than showing a generic failure', async () => {
    const root = await open();
    backend
      .expectOne(`/api/customers/${customer.id}`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    harness.detectChanges();

    expect(testId(root, 'detail-not-found')).not.toBeNull();
  });

  describe('deleting', () => {
    async function openWithRecord(): Promise<HTMLElement> {
      const root = await open();
      backend.expectOne(`/api/customers/${customer.id}`).flush(customer);
      harness.detectChanges();
      return root;
    }

    function confirmDelete(root: HTMLElement): void {
      const trigger = Array.from(root.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Delete',
      );
      trigger?.click();
      harness.detectChanges();
      testId<HTMLElement>(root, 'confirm-delete')?.querySelector('button')?.click();
      harness.detectChanges();
    }

    it('asks first, then deletes, then leaves the page that no longer exists', async () => {
      const root = await openWithRecord();

      confirmDelete(root);

      const request = backend.expectOne(`/api/customers/${customer.id}`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null, { status: 204, statusText: 'No Content' });

      await harness.fixture.whenStable();
      expect(TestBed.inject(Router).url).toBe('/customers');
    });

    it('keeps the dialog open and explains when the delete fails', async () => {
      const root = await openWithRecord();

      confirmDelete(root);
      backend
        .expectOne(`/api/customers/${customer.id}`)
        .flush(null, { status: 403, statusText: 'Forbidden' });
      harness.detectChanges();

      // Closing on failure would leave the user looking at a record that is
      // still there, with no explanation.
      expect(root.querySelector('[role="dialog"]')).not.toBeNull();
      expect(root.textContent).toContain('You do not have permission');
      expect(TestBed.inject(Router).url).toContain(customer.id);
    });
  });
});
