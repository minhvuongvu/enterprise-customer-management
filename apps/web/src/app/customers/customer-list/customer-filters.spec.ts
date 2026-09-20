import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTestTranslations } from '../../core/testing/i18n-testing';
import { DEFAULT_CRITERIA, type CustomerListCriteria } from '../data/customer-list-criteria';
import { CustomerFilters, SEARCH_DEBOUNCE_MS } from './customer-filters';

@Component({
  selector: 'app-customer-filters-host',
  imports: [CustomerFilters],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-customer-filters [criteria]="criteria()" (criteriaChange)="record($event)" />`,
})
class FiltersHost {
  readonly criteria = signal<CustomerListCriteria>(DEFAULT_CRITERIA);
  readonly emitted: CustomerListCriteria[] = [];

  record(criteria: CustomerListCriteria): void {
    this.emitted.push(criteria);
  }
}

/**
 * Debouncing is the property this component exists to have, so it is what this
 * spec is mostly about.
 *
 * Fake timers rather than waiting: the delay is real behaviour, and a test
 * that slept for it would add 300ms per case for no extra confidence.
 */
describe('CustomerFilters', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [FiltersHost, provideTestTranslations()],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function render() {
    const fixture = TestBed.createComponent(FiltersHost);
    fixture.detectChanges();
    return fixture;
  }

  function fieldByLabel(fixture: { nativeElement: unknown }, label: string): HTMLInputElement {
    const root = fixture.nativeElement as HTMLElement;
    const labels = Array.from(root.querySelectorAll('label'));
    const match = labels.find((candidate) => candidate.textContent?.trim().startsWith(label));
    const control = match && root.querySelector(`#${match.getAttribute('for')}`);
    if (!control) {
      throw new Error(`No field labelled "${label}"`);
    }
    return control as HTMLInputElement;
  }

  function type(field: HTMLInputElement, value: string): void {
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  it('emits once for a burst of typing, not once per keystroke', async () => {
    const fixture = await render();
    const search = fieldByLabel(fixture, 'Search');

    type(search, 'n');
    type(search, 'ng');
    type(search, 'ngu');
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 50);

    // Still nothing: every keystroke would otherwise be a history entry, and
    // the back button would be destroyed.
    expect(fixture.componentInstance.emitted).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(100);

    expect(fixture.componentInstance.emitted).toHaveLength(1);
    expect(fixture.componentInstance.emitted[0].search).toBe('ngu');
  });

  it('returns to the first page when the search changes', async () => {
    const fixture = await render();
    fixture.componentInstance.criteria.set({ ...DEFAULT_CRITERIA, page: 7 });
    fixture.detectChanges();

    type(fieldByLabel(fixture, 'Search'), 'nguyen');
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 10);

    expect(fixture.componentInstance.emitted[0].page).toBe(1);
  });

  it('emits immediately for a choice, because a choice is not a draft', async () => {
    const fixture = await render();
    const select = (fixture.nativeElement as HTMLElement).querySelector('select');
    if (!select) {
      throw new Error('no select rendered');
    }

    select.value = 'ACTIVE';
    select.dispatchEvent(new Event('change'));

    expect(fixture.componentInstance.emitted).toHaveLength(1);
    expect(fixture.componentInstance.emitted[0].status).toBe('ACTIVE');
  });

  it('follows the URL when it changes underneath - the back button case', async () => {
    const fixture = await render();

    fixture.componentInstance.criteria.set({ ...DEFAULT_CRITERIA, search: 'from the url' });
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 10);

    expect(fieldByLabel(fixture, 'Search').value).toBe('from the url');
    // Writing the control must not loop back out as a change, or navigating
    // back would immediately navigate forward again.
    expect(fixture.componentInstance.emitted).toHaveLength(0);
  });

  it('clears every filter but keeps the sort and the page size', async () => {
    const fixture = await render();
    fixture.componentInstance.criteria.set({
      ...DEFAULT_CRITERIA,
      size: 50,
      sort: 'fullName,asc',
      search: 'nguyen',
      status: 'ACTIVE',
    });
    fixture.detectChanges();

    const reset = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="reset-filters"] button',
    );
    reset?.click();

    const emitted = fixture.componentInstance.emitted.at(-1);
    expect(emitted?.search).toBe('');
    expect(emitted?.status).toBe('');
    // Clearing a filter is not the same as changing how the list is ordered.
    expect(emitted?.sort).toBe('fullName,asc');
    expect(emitted?.size).toBe(50);
  });
});
