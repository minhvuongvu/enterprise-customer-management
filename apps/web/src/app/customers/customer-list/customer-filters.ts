import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Button } from '../../shared/ui/button/button';
import { Select, type SelectOption } from '../../shared/ui/select/select';
import { TextInput } from '../../shared/ui/text-input/text-input';
import {
  hasActiveFilters,
  withFilterChange,
  type CustomerListCriteria,
} from '../data/customer-list-criteria';
import {
  CUSTOMER_STATUSES,
  GENDERS,
  genderLabelKey,
  statusLabelKey,
  toSelectOptions,
} from '../customer-vocabulary';

/**
 * How long typing has to stop before the URL is written.
 *
 * 300ms is the usual compromise: long enough that an average typist produces
 * one request per word rather than one per letter, short enough that the list
 * still feels like it is reacting to them.
 */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * The list's filter controls.
 *
 * **This is where debouncing lives**, and the reason is worth stating plainly:
 * it belongs next to the keystrokes, not next to the request. Every keystroke
 * would otherwise become a URL change - fifty history entries for one search
 * term, and the back button destroyed. Waiting for typing to settle and *then*
 * writing the URL once fixes both problems with one mechanism, and leaves the
 * store to do the other half: `switchMap` cancels a request that a newer one
 * has superseded.
 *
 * Every other control emits immediately. Choosing a status is a decision, not
 * a draft, and delaying it would only make the UI feel slow.
 *
 * The component owns no criteria. `criteria` comes in, `criteriaChange` goes
 * out, and the page turns that into a navigation - which is what keeps the URL
 * the single source of truth even while a text field holds a half-typed word.
 */
@Component({
  selector: 'app-customer-filters',
  imports: [Button, ReactiveFormsModule, Select, TextInput, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form
      class="filters"
      *transloco="let t"
      [attr.aria-label]="t('pages.customers.list.filters.label')"
      (submit)="$event.preventDefault()"
    >
      <div class="filters__field filters__field--wide">
        <app-text-input
          type="search"
          name="search"
          [formControl]="searchControl"
          [label]="t('pages.customers.list.filters.search')"
          [placeholder]="t('pages.customers.list.filters.searchPlaceholder')"
          [hint]="t('pages.customers.list.filters.searchHint')"
        />
      </div>

      <div class="filters__field">
        <app-select
          name="status"
          [formControl]="statusControl"
          [label]="t('pages.customers.list.filters.status')"
          [placeholder]="t('pages.customers.list.filters.anyStatus')"
          [options]="statusOptions()"
        />
      </div>

      <div class="filters__field">
        <app-select
          name="gender"
          [formControl]="genderControl"
          [label]="t('pages.customers.list.filters.gender')"
          [placeholder]="t('pages.customers.list.filters.anyGender')"
          [options]="genderOptions()"
        />
      </div>

      <div class="filters__field">
        <app-text-input
          type="date"
          name="createdFrom"
          [formControl]="createdFromControl"
          [label]="t('pages.customers.list.filters.createdFrom')"
        />
      </div>

      <div class="filters__field">
        <app-text-input
          type="date"
          name="createdTo"
          [formControl]="createdToControl"
          [label]="t('pages.customers.list.filters.createdTo')"
        />
      </div>

      <div class="filters__actions">
        <app-button
          variant="ghost"
          [disabled]="!anyActive()"
          (click)="reset()"
          data-testid="reset-filters"
        >
          {{ t('pages.customers.list.filters.reset') }}
        </app-button>
      </div>
    </form>
  `,
  styles: `
    @use 'styles/breakpoints' as bp;

    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
      align-items: end;
      gap: var(--space-3);
      padding: var(--space-4);
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-lg);
      background-color: var(--surface-raised);
    }

    .filters__field--wide {
      grid-column: 1 / -1;
    }

    .filters__actions {
      display: flex;
      justify-content: flex-end;
    }

    @media #{bp.$tablet-up} {
      .filters__field--wide {
        grid-column: span 2;
      }
    }
  `,
})
export class CustomerFilters {
  readonly criteria = input.required<CustomerListCriteria>();
  readonly criteriaChange = output<CustomerListCriteria>();

  private readonly transloco = inject(TranslocoService);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly statusControl = new FormControl('', { nonNullable: true });
  protected readonly genderControl = new FormControl('', { nonNullable: true });
  protected readonly createdFromControl = new FormControl('', { nonNullable: true });
  protected readonly createdToControl = new FormControl('', { nonNullable: true });

  protected readonly anyActive = computed(() => hasActiveFilters(this.criteria()));

  /**
   * The active language, as a signal.
   *
   * `translate()` returns a snapshot, so a computed that calls it has no
   * dependency on the language and would keep the labels of whichever one was
   * active when it first ran. Reading this - and passing it to `translate` -
   * makes that dependency real rather than decorative.
   */
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly statusOptions = computed<readonly SelectOption[]>(() =>
    toSelectOptions(CUSTOMER_STATUSES, statusLabelKey, this.translator()),
  );

  protected readonly genderOptions = computed<readonly SelectOption[]>(() =>
    toSelectOptions(GENDERS, genderLabelKey, this.translator()),
  );

  constructor() {
    // The URL is the source of truth, so the controls follow it - including
    // when it changed because the user pressed Back. `emitEvent: false` stops
    // that write from looping straight back out as a criteria change.
    effect(() => {
      const criteria = this.criteria();
      this.writeIfChanged(this.searchControl, criteria.search);
      this.writeIfChanged(this.statusControl, criteria.status);
      this.writeIfChanged(this.genderControl, criteria.gender);
      this.writeIfChanged(this.createdFromControl, criteria.createdFrom);
      this.writeIfChanged(this.createdToControl, criteria.createdTo);
    });

    this.searchControl.valueChanges
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        // Without this, blurring a field or an external write that happens to
        // match would emit a change that changes nothing - and push a history
        // entry for it.
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((value) => this.emit({ search: value.trim() }));

    this.immediate(this.statusControl, (value) => ({
      status: value as CustomerListCriteria['status'],
    }));
    this.immediate(this.genderControl, (value) => ({
      gender: value as CustomerListCriteria['gender'],
    }));
    this.immediate(this.createdFromControl, (value) => ({ createdFrom: value }));
    this.immediate(this.createdToControl, (value) => ({ createdTo: value }));
  }

  /** Clears the filters, keeping how the list is sorted and how big a page is. */
  protected reset(): void {
    this.emit({
      search: '',
      status: '',
      gender: '',
      createdFrom: '',
      createdTo: '',
    });
  }

  private immediate(
    control: FormControl<string>,
    toChange: (value: string) => Partial<CustomerListCriteria>,
  ): void {
    control.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.emit(toChange(value)));
  }

  private emit(change: Partial<CustomerListCriteria>): void {
    this.criteriaChange.emit(withFilterChange(this.criteria(), change));
  }

  private writeIfChanged(control: FormControl<string>, value: string): void {
    if (control.value !== value) {
      control.setValue(value, { emitEvent: false });
    }
  }

  private translator(): (key: string) => string {
    const lang = this.activeLang();
    return (key) => this.transloco.translate(key, {}, lang);
  }
}
