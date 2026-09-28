import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Customer, CustomerId } from '@ecm/contracts';
import { provideTestTranslations } from '../../core/testing/i18n-testing';
import { aCustomer, anotherCustomer } from '../testing/customer.fixture';
import { CustomerCardList } from './customer-card-list';

@Component({
  selector: 'app-card-list-host',
  imports: [CustomerCardList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-customer-card-list
      [rows]="rows()"
      [sort]="sort()"
      [selectedIds]="selected()"
      [selectable]="selectable()"
      (sortChange)="sorts.push($event)"
      (rowToggled)="toggled.push($event)"
      (allToggled)="all.push($event)"
    />
  `,
})
class CardListHost {
  readonly rows = signal<readonly Customer[]>([aCustomer(), anotherCustomer()]);
  readonly sort = signal('updatedAt,desc');
  readonly selected = signal<ReadonlySet<CustomerId>>(new Set());
  readonly selectable = signal(true);
  readonly sorts: string[] = [];
  readonly toggled: CustomerId[] = [];
  readonly all: boolean[] = [];
}

/**
 * The phone layout of the list. Its contract is `CustomerTable`'s - same
 * inputs, same outputs - so these tests are about the two things a card list
 * has to supply that a table gets from its header row: sorting and select-all.
 */
describe('CustomerCardList', () => {
  async function render() {
    await TestBed.configureTestingModule({
      imports: [CardListHost, provideTestTranslations()],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(CardListHost);
    fixture.detectChanges();
    return fixture;
  }

  function root(fixture: { nativeElement: unknown }): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders one list item per customer, every value labelled in place', async () => {
    const fixture = await render();
    const cards = root(fixture).querySelectorAll('li');

    expect(cards).toHaveLength(2);
    const labels = Array.from(cards[0].querySelectorAll('dt')).map((dt) => dt.textContent?.trim());
    expect(labels).toEqual(['Code', 'Email', 'Last updated', 'Gender']);
    expect(cards[0].querySelector('a')?.textContent?.trim()).toBe(aCustomer().fullName);
  });

  it('names each checkbox after its customer', async () => {
    const fixture = await render();
    const boxes = root(fixture).querySelectorAll<HTMLInputElement>('li input[type="checkbox"]');

    expect(boxes[0].getAttribute('aria-label')).toBe(`Select ${aCustomer().fullName}`);

    boxes[1].click();
    expect(fixture.componentInstance.toggled).toEqual([anotherCustomer().id]);
  });

  it('offers every sortable column in both directions, showing the current one', async () => {
    const fixture = await render();
    const select = root(fixture).querySelector<HTMLSelectElement>('select');
    if (!select) {
      throw new Error('no sort select');
    }

    expect(select.options).toHaveLength(10);
    expect(select.selectedOptions[0].textContent?.trim()).toBe('Last updated, descending');

    select.value = 'fullName,asc';
    select.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.sorts).toEqual(['fullName,asc']);
  });

  it('follows the URL when the sort changes elsewhere, without echoing it back', async () => {
    const fixture = await render();
    fixture.componentInstance.sort.set('email,asc');
    fixture.detectChanges();

    expect(root(fixture).querySelector('select')?.value).toBe('email,asc');
    expect(fixture.componentInstance.sorts).toEqual([]);
  });

  it('selects the whole page from its own labelled checkbox', async () => {
    const fixture = await render();
    const selectAll = root(fixture).querySelector<HTMLInputElement>('[data-testid="select-all"]');

    expect(selectAll?.closest('label')?.textContent?.trim()).toBe(
      'Select every customer on this page',
    );
    selectAll?.click();
    expect(fixture.componentInstance.all).toEqual([true]);
  });

  it('offers no selection to a user who cannot act on it', async () => {
    const fixture = await render();
    fixture.componentInstance.selectable.set(false);
    fixture.detectChanges();

    expect(root(fixture).querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });
});
