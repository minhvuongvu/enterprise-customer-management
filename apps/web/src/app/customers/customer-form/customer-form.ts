import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Select, type SelectOption } from '../../shared/ui/select/select';
import { TextInput } from '../../shared/ui/text-input/text-input';
import {
  CUSTOMER_STATUSES,
  GENDERS,
  genderLabelKey,
  statusLabelKey,
  toSelectOptions,
} from '../customer-vocabulary';
import { MAX_TAGS, type CustomerForm as CustomerFormGroup } from './customer-form-model';
import { clearServerError, firstError, shouldShow } from './validation-messages';

/** Every control that can show its own message, in the order they appear. */
const FIELD_PATHS: readonly string[] = [
  'fullName',
  'email',
  'phone',
  'dateOfBirth',
  'tags',
  'address.line1',
  'address.line2',
  'address.city',
  'address.postalCode',
  'address.country',
];

/**
 * The customer form's fields.
 *
 * Presentation only: it renders the `FormGroup` it is given and says what is
 * wrong with it. Loading, saving, conflicts and navigation belong to the page,
 * which is what keeps this component reviewable as a form rather than as a
 * feature.
 *
 * ## Why the error messages are a signal
 *
 * This component is `OnPush`, and a reactive form's status changes do not mark
 * it for check - the form is a plain object, not a signal. Reading
 * `control.errors` straight from the template therefore works until the day it
 * does not, and it fails as "the error appears one keystroke late", which is
 * the kind of bug that gets fixed with a stray `detectChanges()`.
 *
 * Subscribing to the form's own streams and bumping a signal makes the
 * dependency explicit: the template reads a signal, the signal changes when
 * the form does, and change detection follows.
 */
@Component({
  selector: 'app-customer-form',
  imports: [ReactiveFormsModule, Select, TextInput, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="form" *transloco="let t" [formGroup]="form()">
      <section class="form__section">
        <h2 class="form__legend">{{ t('pages.customers.form.sections.identity') }}</h2>

        <app-text-input
          name="fullName"
          formControlName="fullName"
          autocomplete="name"
          [label]="t('customers.field.fullName')"
          [required]="true"
          [error]="errorFor('fullName')"
        />

        <app-text-input
          type="email"
          name="email"
          formControlName="email"
          autocomplete="email"
          [label]="t('customers.field.email')"
          [required]="true"
          [hint]="emailPending() ? t('pages.customers.form.checkingEmail') : ''"
          [error]="errorFor('email')"
        />

        <app-text-input
          type="tel"
          name="phone"
          formControlName="phone"
          autocomplete="tel"
          [label]="t('customers.field.phone')"
          [hint]="t('pages.customers.form.phoneHint')"
          [error]="errorFor('phone')"
        />

        <app-text-input
          type="date"
          name="dateOfBirth"
          formControlName="dateOfBirth"
          [label]="t('customers.field.dateOfBirth')"
          [error]="errorFor('dateOfBirth')"
        />

        <app-select
          name="gender"
          formControlName="gender"
          [label]="t('customers.field.gender')"
          [options]="genderOptions()"
        />

        <app-select
          name="status"
          formControlName="status"
          [label]="t('customers.field.status')"
          [options]="statusOptions()"
          [hint]="t('pages.customers.form.statusHint')"
        />

        @if (crossFieldError(); as message) {
          <p class="form__cross-error" role="alert" data-testid="cross-field-error">
            {{ t(message) }}
          </p>
        }
      </section>

      <section class="form__section" formGroupName="address">
        <h2 class="form__legend">{{ t('pages.customers.form.sections.address') }}</h2>
        <p class="form__note">{{ t('pages.customers.form.addressNote') }}</p>

        <app-text-input
          name="line1"
          formControlName="line1"
          autocomplete="address-line1"
          [label]="t('customers.field.addressLine1')"
          [error]="errorFor('address.line1')"
        />
        <app-text-input
          name="line2"
          formControlName="line2"
          autocomplete="address-line2"
          [label]="t('customers.field.addressLine2')"
          [error]="errorFor('address.line2')"
        />
        <app-text-input
          name="city"
          formControlName="city"
          autocomplete="address-level2"
          [label]="t('customers.field.city')"
          [error]="errorFor('address.city')"
        />
        <app-text-input
          name="postalCode"
          formControlName="postalCode"
          autocomplete="postal-code"
          [label]="t('customers.field.postalCode')"
          [error]="errorFor('address.postalCode')"
        />
        <app-text-input
          name="country"
          formControlName="country"
          autocomplete="country"
          [label]="t('customers.field.country')"
          [hint]="t('pages.customers.form.countryHint')"
          [error]="errorFor('address.country')"
        />

        @if (addressError(); as message) {
          <p class="form__cross-error" role="alert" data-testid="address-error">{{ t(message) }}</p>
        }
      </section>

      <section class="form__section">
        <h2 class="form__legend">{{ t('pages.customers.form.sections.tags') }}</h2>

        <app-text-input
          name="tags"
          formControlName="tags"
          [label]="t('customers.field.tags')"
          [hint]="t('pages.customers.form.tagsHint', { max: maxTags })"
          [error]="errorFor('tags')"
        />
      </section>
    </div>
  `,
  styles: `
    @use 'styles/breakpoints' as bp;

    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }

    .form__section {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-4);
      padding: var(--space-5);
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-lg);
      background-color: var(--surface-raised);
    }

    .form__legend {
      font-size: var(--text-lg);
    }

    .form__note {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .form__cross-error {
      color: var(--danger-text);
      font-size: var(--text-sm);
    }

    @media #{bp.$tablet-up} {
      .form__section {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .form__legend,
      .form__note,
      .form__cross-error {
        grid-column: 1 / -1;
      }
    }
  `,
})
export class CustomerForm {
  readonly form = input.required<CustomerFormGroup>();
  /** True once a save has been attempted: errors then show without a blur. */
  readonly submitted = input(false);

  private readonly transloco = inject(TranslocoService);
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly maxTags = MAX_TAGS;

  /** Bumped whenever the form changes, so the computed messages re-run. */
  private readonly formVersion = signal(0);

  protected readonly genderOptions = computed<readonly SelectOption[]>(() =>
    toSelectOptions(GENDERS, genderLabelKey, this.translator()),
  );
  protected readonly statusOptions = computed<readonly SelectOption[]>(() =>
    toSelectOptions(CUSTOMER_STATUSES, statusLabelKey, this.translator()),
  );

  private readonly messages = computed<Record<string, string>>(() => {
    this.formVersion();
    const form = this.form();
    const submitted = this.submitted();
    const lang = this.activeLang();

    const result: Record<string, string> = {};
    for (const path of FIELD_PATHS) {
      const control = form.get(path);
      if (!control || !shouldShow(control, submitted)) {
        continue;
      }
      const error = firstError(control.errors);
      if (error) {
        result[path] = this.transloco.translate(error.key, error.params, lang);
      }
    }
    return result;
  });

  /** The address group's own rule, shown under the group rather than a field. */
  protected readonly addressError = computed<string | null>(() => {
    this.formVersion();
    const group = this.form().controls.address;
    return (this.submitted() || group.touched) && group.errors?.['addressIncomplete']
      ? 'customers.validation.addressIncomplete'
      : null;
  });

  /** The whole-record rule: an active customer needs a phone number. */
  protected readonly crossFieldError = computed<string | null>(() => {
    this.formVersion();
    const form = this.form();
    return (this.submitted() || form.touched) && form.errors?.['phoneRequiredWhenActive']
      ? 'customers.validation.phoneRequiredWhenActive'
      : null;
  });

  protected readonly emailPending = computed(() => {
    this.formVersion();
    return this.form().controls.email.pending;
  });

  constructor() {
    // An effect rather than a constructor subscription: `form` is an input, so
    // it is not readable until the first change detection, and it can be
    // replaced. The cleanup makes replacing it safe instead of leaking a
    // subscription to the previous one.
    effect((onCleanup) => {
      const form = this.form();

      // `events` rather than `statusChanges`: it also reports touched and
      // pristine changes, and "show the error once the field has been
      // touched" depends on exactly those.
      const subscriptions = [
        form.events.subscribe(() => this.formVersion.update((version) => version + 1)),
      ];

      // A value the server rejected stops being rejected the moment *that
      // value* changes. Subscribed per control rather than to the group,
      // because the group cannot say which field changed - and clearing them
      // all on any edit would wipe the marks the moment the user starts
      // fixing the first one.
      for (const path of FIELD_PATHS) {
        const control = form.get(path);
        if (control) {
          subscriptions.push(control.valueChanges.subscribe(() => clearServerError(control)));
        }
      }

      onCleanup(() => subscriptions.forEach((subscription) => subscription.unsubscribe()));
    });
  }

  protected errorFor(path: string): string {
    return this.messages()[path] ?? '';
  }

  private translator(): (key: string) => string {
    const lang = this.activeLang();
    return (key) => this.transloco.translate(key, {}, lang);
  }
}
