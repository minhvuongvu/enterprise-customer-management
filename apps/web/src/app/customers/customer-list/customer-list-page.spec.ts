import { provideLocationMocks } from '@angular/common/testing';
import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTestHttp } from '../../core/testing/http-testing';
import { provideTestTranslations } from '../../core/testing/i18n-testing';
import { CustomerCache } from '../state/customer-cache';
import { CustomerStore } from '../state/customer-store';
import { aCustomer, anotherCustomer, aPage } from '../testing/customer.fixture';
import { CustomerListPage } from './customer-list-page';
import { provideSignedInAs } from '../../core/testing/session-testing';

/**
 * The list, end to end within the browser.
 *
 * It goes through the real router so that the property the whole design rests
 * on is actually exercised: the URL is the input. The page is never handed a
 * page number - it is navigated to, exactly as a bookmark or a back button
 * would do it.
 */
describe('CustomerListPage', () => {
  let backend: HttpTestingController;
  let harness: RouterTestingHarness;

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
              path: 'customers',
              // The same route-scoped providers the feature declares, so the
              // store's lifetime in the test is its lifetime in the app.
              providers: [CustomerCache, CustomerStore],
              component: CustomerListPage,
            },
          ],
          withComponentInputBinding(),
        ),
      ],
    }).compileComponents();

    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  function listRequest(): TestRequest {
    return backend.expectOne((request) => request.url === '/api/customers');
  }

  async function open(url = '/customers'): Promise<HTMLElement> {
    harness = await RouterTestingHarness.create(url);
    return harness.routeNativeElement as HTMLElement;
  }

  function text(root: HTMLElement): string {
    return root.textContent ?? '';
  }

  function testId<T extends HTMLElement>(root: HTMLElement, id: string): T | null {
    return root.querySelector<T>(`[data-testid="${id}"]`);
  }

  it('reads the page number out of the URL and asks for that page', async () => {
    await open('/customers?page=3&size=50&search=nguyen');

    const request = listRequest();
    expect(request.request.params.get('page')).toBe('3');
    expect(request.request.params.get('size')).toBe('50');
    expect(request.request.params.get('search')).toBe('nguyen');

    request.flush(aPage([aCustomer()], { page: 3, size: 50, totalItems: 120, totalPages: 3 }));
    harness.detectChanges();
  });

  it('restores the filter controls from the URL, not just the request', async () => {
    const root = await open('/customers?status=ACTIVE&gender=FEMALE&search=smith');
    listRequest().flush(aPage([aCustomer()]));
    harness.detectChanges();

    // A link that restores the results but leaves the controls blank tells
    // the user the list is unfiltered, and they clear a filter that was not
    // there.
    const selects = root.querySelectorAll('select');
    expect(selects[0].value).toBe('ACTIVE');
    expect(selects[1].value).toBe('FEMALE');
    expect(root.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe('smith');
  });

  it('shows a skeleton first, then the rows', async () => {
    const root = await open();

    expect(root.querySelector('app-skeleton')).not.toBeNull();

    listRequest().flush(aPage([aCustomer(), anotherCustomer()]));
    harness.detectChanges();

    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(text(root)).toContain('Nguyễn Văn A');
  });

  it('distinguishes an empty search from an empty database', async () => {
    const root = await open('/customers?search=nothing');
    listRequest().flush(aPage([], { totalItems: 0, totalPages: 0 }));
    harness.detectChanges();

    // The two need different words: one offers to clear the filters, the
    // other offers to create the first customer.
    expect(text(root)).toContain('No customer matches the current search');

    await harness.navigateByUrl('/customers');
    listRequest().flush(aPage([], { totalItems: 0, totalPages: 0 }));
    harness.detectChanges();

    expect(text(root)).toContain('There are no customers yet');
  });

  it('shows the error the taxonomy produced, never the server body', async () => {
    const root = await open();
    listRequest().flush('<html>Stack trace</html>', { status: 500, statusText: 'Server Error' });
    harness.detectChanges();

    expect(testId(root, 'list-error')).not.toBeNull();
    expect(text(root)).toContain('Something went wrong on our side');
    expect(text(root)).not.toContain('Stack trace');
  });

  it('puts a sort change in the URL, and asks the server to do the sorting', async () => {
    const root = await open();
    listRequest().flush(aPage([aCustomer()]));
    harness.detectChanges();

    const header = Array.from(root.querySelectorAll<HTMLButtonElement>('th .sort')).find((button) =>
      button.textContent?.includes('Full name'),
    );
    header?.click();
    // The click asks the router to navigate, which is asynchronous: the URL is
    // the source of truth, so nothing happens until it has actually changed.
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toContain('sort=fullName,asc');
    listRequest().flush(aPage([aCustomer()]));
  });

  it('clears the selection when the criteria change', async () => {
    const root = await open();
    listRequest().flush(aPage([aCustomer(), anotherCustomer()]));
    harness.detectChanges();

    testId<HTMLInputElement>(root, 'select-all')?.click();
    harness.detectChanges();
    expect(text(testId(root, 'selection-count') as HTMLElement)).toContain('2 selected');

    await harness.navigateByUrl('/customers?page=2');
    listRequest().flush(aPage([aCustomer()]));
    harness.detectChanges();

    // A selection made against a different page of results is how the wrong
    // records get deleted.
    expect(testId(root, 'selection-count')).toBeNull();
  });

  it('reports a bulk action per item and keeps the failures selected', async () => {
    const root = await open();
    const first = aCustomer();
    const second = anotherCustomer();
    listRequest().flush(aPage([first, second]));
    harness.detectChanges();

    testId<HTMLInputElement>(root, 'select-all')?.click();
    harness.detectChanges();

    testId<HTMLElement>(root, 'bulk-deactivate')?.querySelector('button')?.click();
    harness.detectChanges();

    backend.expectOne('/api/customers/bulk').flush({
      requested: 2,
      succeeded: 1,
      failed: 1,
      results: [
        { id: first.id, outcome: 'SUCCEEDED' },
        { id: second.id, outcome: 'FAILED', errorCode: 'CONFLICT' },
      ],
    });
    listRequest().flush(aPage([first, second]));
    harness.detectChanges();

    const report = testId(root, 'bulk-report');
    expect(text(report as HTMLElement)).toContain('1 of 2 succeeded');
    // Grouped by reason, because a list of twenty identical sentences is not
    // a report.
    expect(text(report as HTMLElement)).toContain('1 were changed by someone else');
    // The ones that failed stay selected, ready to be tried again.
    expect(text(testId(root, 'selection-count') as HTMLElement)).toContain('1 selected');
  });
});
