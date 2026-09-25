import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StatusChangeEvent } from '@angular/forms';
import { Router } from '@angular/router';
import type { Customer } from '@ecm/contracts';
import { filter, take, Observable } from 'rxjs';
import { isAppError, messageKeyOf } from '../../core/errors/app-error';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { Button } from '../../shared/ui/button/button';
import { ConfirmationService } from '../../core/notifications/confirmation.service';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import { TranslocoDirective } from '@jsverse/transloco';
import { parseCustomerId } from '../data/customer-id';
import { CustomerStore } from '../state/customer-store';
import { valueOf } from '../state/remote-data';
import { CustomerForm as CustomerFormFields } from './customer-form';
import {
  createCustomerForm,
  isEmptyPatch,
  toCreateRequest,
  toFormValue,
  toUpdateRequest,
  type CustomerForm as CustomerFormGroup,
} from './customer-form-model';
import { emailAvailabilityValidator } from './email-availability.validator';
import { applyServerFieldErrors } from './validation-messages';
import type { CanLeave } from './unsaved-changes.guard';

/** Which job this page is doing. Supplied by the route, not inferred. */
export type CustomerFormMode = 'create' | 'edit';

/**
 * Create and edit - one page, told which it is by the route.
 *
 * The mode comes from route metadata rather than from "is there an id",
 * because those are not the same question, and a duplicate flow that has an id
 * and still creates a record would silently do the wrong thing.
 *
 * ## What this page owns
 *
 * The form, and everything about *this attempt to save it*: the values, which
 * fields have been touched, whether a save is in flight, what the server said
 * about it. None of that is server state and none of it belongs in the store -
 * it exists for as long as this page is open and is meaningless afterwards.
 *
 * ## The conflict path
 *
 * A 409 carrying `currentVersion` means someone saved while this form was
 * open. The page does not offer to force the write. It offers to **reload the
 * newest record while keeping the values in the form**, and then to save
 * again - which works because the update is a PATCH computed against the
 * record the form was filled from: fields the other person changed and this
 * user did not are simply not in the payload, so their work survives. That is
 * optimistic concurrency doing what it is for, rather than a dialog asking a
 * user to choose between two edits they cannot see.
 *
 * A 409 *without* `currentVersion` is the other thing that status means here:
 * the email address is already in use. Same code, different data, different
 * answer - see `ConflictError`.
 */
@Component({
  selector: 'app-customer-form-page',
  host: {
    // Closing the tab, reloading or typing a new address is not a router
    // navigation, so the guard below never hears of it (Phase 5).
    '(window:beforeunload)': 'warnBeforeUnload($event)',
  },
  imports: [
    Button,
    CustomerFormFields,
    ErrorState,
    PageContainer,
    PageHeader,
    Skeleton,
    TranslocoDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t">
      <app-page-header
        [heading]="t(headingKey())"
        [description]="t('pages.customers.form.description')"
      >
        <div pageActions>
          <app-button [link]="cancelLink()">{{ t('common.cancel') }}</app-button>
        </div>
      </app-page-header>

      @switch (view()) {
        @case ('loading') {
          <app-skeleton [lines]="10" />
          <p class="visually-hidden" role="status">{{ t('pages.customers.form.loading') }}</p>
        }

        @case ('missing') {
          <app-error-state
            [heading]="t('pages.customers.detail.notFoundHeading')"
            [description]="t('pages.customers.detail.notFoundBody')"
            data-testid="form-not-found"
          />
        }

        @case ('error') {
          <app-error-state
            [heading]="t('pages.customers.form.loadErrorHeading')"
            [description]="t(loadErrorKey())"
            [retryLabel]="t('common.retry')"
            (retry)="reload()"
            data-testid="form-load-error"
          />
        }

        @case ('form') {
          <!--
            The native submit event, not ngSubmit. This form element carries no
            forms directive - the FormGroup is bound inside app-customer-form -
            so ngSubmit would be an output nobody provides and the button would
            silently do nothing. novalidate turns off the browser's own bubbles,
            which cannot be translated and do not match the messages below.
          -->
          <form (submit)="handleSubmit($event)" novalidate>
            @if (remoteChange(); as change) {
              <!-- Realtime news about the record being edited. The form is not
                   touched: the user's typing is theirs. What they are offered
                   is the same reload the conflict panel offers - their fields
                   kept, everyone else's refreshed (ADR-0015) - before saving,
                   instead of a 409 after. -->
              <div class="conflict" role="status" data-testid="remote-change">
                <p class="conflict__heading">
                  {{ t('pages.customers.form.remote.' + change + 'Heading') }}
                </p>
                <p>{{ t('pages.customers.form.remote.' + change + 'Body') }}</p>
                @if (change !== 'deleted') {
                  <app-button variant="secondary" (click)="reloadKeepingChanges()">
                    {{ t('pages.customers.form.conflictReload') }}
                  </app-button>
                }
              </div>
            }

            @if (conflict()) {
              <div class="conflict" role="alert" data-testid="conflict">
                <p class="conflict__heading">{{ t('pages.customers.form.conflictHeading') }}</p>
                <p>{{ t('pages.customers.form.conflictBody') }}</p>
                <app-button variant="secondary" (click)="reloadKeepingChanges()">
                  {{ t('pages.customers.form.conflictReload') }}
                </app-button>
              </div>
            }

            @if (reloaded()) {
              <p class="notice" role="status" data-testid="reloaded-notice">
                {{ t('pages.customers.form.conflictReloaded') }}
              </p>
            }

            @if (submitError(); as key) {
              <p class="submit-error" role="alert" data-testid="submit-error">{{ t(key) }}</p>
            }

            <app-customer-form [form]="form" [submitted]="submitted()" />

            <div class="actions">
              <app-button
                type="submit"
                variant="primary"
                [loading]="saving() || reloading()"
                data-testid="save"
              >
                {{ t(mode() === 'create' ? 'pages.customers.form.create' : 'common.save') }}
              </app-button>
              <app-button
                [disabled]="saving() || !dirty()"
                (click)="resetForm()"
                data-testid="reset-form"
              >
                {{ t('common.reset') }}
              </app-button>
              <app-button variant="ghost" [link]="cancelLink()">{{
                t('common.cancel')
              }}</app-button>
            </div>
          </form>
        }
      }
    </app-page-container>
  `,
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .conflict,
    .notice,
    .submit-error {
      padding: var(--space-3) var(--space-4);
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-md);
    }

    .conflict {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
      border-color: var(--warning);
      background-color: var(--warning-subtle);
      color: var(--warning-text);
    }

    .conflict__heading {
      font-weight: var(--weight-semibold);
    }

    .notice {
      border-color: var(--accent);
      background-color: var(--accent-subtle);
      color: var(--accent-text);
    }

    .submit-error {
      border-color: var(--danger);
      background-color: var(--danger-subtle);
      color: var(--danger-text);
    }
  `,
})
export class CustomerFormPage implements CanLeave {
  /** From route `data`. */
  readonly mode = input.required<CustomerFormMode>();
  /** From the `:id` route parameter - absent when creating. */
  readonly id = input<string>();

  private readonly store = inject(CustomerStore);
  private readonly confirmation = inject(ConfirmationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form: CustomerFormGroup = createCustomerForm();

  /**
   * The record the form was filled from.
   *
   * What the user changed is the difference between this and the form, which
   * is why it does **not** move when the record is reloaded after a conflict:
   * the user's edits are still edits to this version of the record.
   */
  private readonly baseline = signal<Customer | null>(null);
  /** The newest record the server has given us. Supplies the version to write against. */
  private readonly latest = signal<Customer | null>(null);
  private readonly filledFor = signal<string | null>(null);

  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly conflict = signal(false);
  protected readonly reloaded = signal(false);
  /** True between asking for the newest record and receiving it. */
  private readonly awaitingReload = signal(false);

  /**
   * Someone else changed or deleted this record since the form was filled -
   * news from the realtime stream, shown in edit mode and only while no
   * conflict panel is already saying the same thing.
   */
  protected readonly remoteChange = computed(() =>
    this.mode() === 'edit' && !this.conflict() ? this.store.detailStaleness() : null,
  );

  /** Bumped by the form's own events, so `dirty()` is reactive under OnPush. */
  private readonly formVersion = signal(0);
  protected readonly dirty = computed(() => {
    this.formVersion();
    return this.form.dirty;
  });

  private readonly customerId = computed(() => parseCustomerId(this.id()));
  private readonly detail = this.store.detail;

  protected readonly headingKey = computed(() =>
    this.mode() === 'create' ? 'pages.customers.create.heading' : 'pages.customers.edit.heading',
  );

  /** Cancelling returns to where the record lives, not to a fixed page. */
  protected readonly cancelLink = computed<unknown[]>(() => {
    const id = this.id();
    return id ? ['/customers', id] : ['/customers'];
  });

  protected readonly view = computed<'loading' | 'missing' | 'error' | 'form'>(() => {
    if (this.mode() === 'create') {
      return 'form';
    }
    if (this.customerId() === null) {
      return 'missing';
    }
    const state = this.detail();
    if (state.status === 'idle' || state.status === 'loading') {
      return 'loading';
    }
    if (state.status === 'error' && state.value === null) {
      return state.error.kind === 'not-found' ? 'missing' : 'error';
    }
    return 'form';
  });

  /** True while the record is being read or re-read. */
  protected readonly reloading = computed(() => {
    const status = this.detail().status;
    return status === 'loading' || status === 'refreshing';
  });

  protected readonly loadErrorKey = computed(() => {
    const state = this.detail();
    return state.status === 'error' ? state.error.messageKey : 'errors.unknown';
  });

  constructor() {
    this.form.controls.email.addAsyncValidators(
      emailAvailabilityValidator(this.store, () => this.baseline()?.id ?? null),
    );

    effect((onCleanup) => {
      const subscription = this.form.events.subscribe(() =>
        this.formVersion.update((version) => version + 1),
      );
      onCleanup(() => subscription.unsubscribe());
    });

    effect(() => {
      const id = this.customerId();
      if (this.mode() === 'edit' && id) {
        this.store.selectCustomer(id);
      }
    });

    effect(() => {
      if (this.mode() !== 'edit') {
        return;
      }
      const record = valueOf(this.detail());
      if (!record || record.id !== this.customerId()) {
        return;
      }

      // The newest record always becomes `latest`, which is what the next
      // write states its version against. The *form* is only filled once per
      // customer - a refresh never overwrites what the user has typed - and
      // `baseline` moves only when the form does, so the diff keeps measuring
      // this user's changes rather than everyone's.
      this.latest.set(record);

      // The reload has landed. Saying so only now is what makes the notice
      // true - and what stops a save going out against the version that was
      // just superseded, which would conflict all over again.
      if (this.awaitingReload() && this.detail().status === 'success') {
        this.awaitingReload.set(false);
        this.reloaded.set(true);
      }

      if (this.filledFor() !== record.id) {
        this.filledFor.set(record.id);
        this.baseline.set(record);
        this.form.reset(toFormValue(record));
      }
    });
  }

  // ------------------------------------------------------------- submitting

  protected handleSubmit(event: Event): void {
    event.preventDefault();
    this.submit();
  }

  protected submit(): void {
    this.submitted.set(true);
    this.submitError.set(null);
    this.reloaded.set(false);

    if (this.saving()) {
      return;
    }

    if (this.form.pending) {
      // The asynchronous email check has not answered yet. Returning here
      // would make the button do nothing, which a user reads as broken - and
      // it is easy to hit, because the check waits for typing to settle.
      // Waiting for the verdict and then continuing is what they expect.
      this.saving.set(true);
      // `events`, not `statusChanges`. When an asynchronous validator
      // resolves, Angular publishes a StatusChangeEvent but does **not** emit
      // on `statusChanges` - so a wait built on that stream never ends, and
      // the button stays in its busy state for ever. The same distinction is
      // why app-customer-form listens to `events` for its messages.
      this.form.events
        .pipe(
          filter(
            (event): event is StatusChangeEvent =>
              event instanceof StatusChangeEvent && event.status !== 'PENDING',
          ),
          take(1),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => {
          this.saving.set(false);
          this.submit();
        });
      return;
    }

    if (this.form.invalid) {
      // Focus is not moved here: every invalid field is already marked and
      // described, and stealing focus mid-form is disorienting when the
      // problem may be the field the user is standing in.
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    if (this.mode() === 'create') {
      this.createCustomer();
    } else {
      this.saveCustomer();
    }
  }

  private createCustomer(): void {
    this.store
      .create(toCreateRequest(this.form))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.saving.set(false);
          this.form.markAsPristine();
          void this.router.navigate(['/customers', created.id]);
        },
        error: (error: unknown) => this.handleFailure(error),
      });
  }

  private saveCustomer(): void {
    const baseline = this.baseline();
    const latest = this.latest();
    if (!baseline || !latest) {
      this.saving.set(false);
      return;
    }

    const patch = toUpdateRequest(baseline, this.form, latest.version);
    if (isEmptyPatch(patch)) {
      // Nothing changed. Sending an empty PATCH would bump the version and
      // write an audit entry recording that nobody did anything.
      this.saving.set(false);
      this.form.markAsPristine();
      void this.router.navigate(['/customers', baseline.id]);
      return;
    }

    this.store
      .update(baseline.id, patch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.conflict.set(false);
          this.baseline.set(updated);
          this.latest.set(updated);
          this.form.markAsPristine();
          void this.router.navigate(['/customers', updated.id]);
        },
        error: (error: unknown) => this.handleFailure(error),
      });
  }

  /**
   * Turns a failed save into something the form can show.
   *
   * Four cases, and each one is answered in the place the user is looking:
   * field errors on the fields, a stale write as a conflict panel, a duplicate
   * email on the email control, and anything else as one message above the
   * form.
   */
  private handleFailure(error: unknown): void {
    this.saving.set(false);

    if (!isAppError(error)) {
      this.submitError.set('errors.unknown');
      return;
    }

    if (error.kind === 'validation') {
      const unmatched = applyServerFieldErrors(this.form, error.fieldErrors);
      this.submitError.set(
        unmatched.length > 0 ? 'errors.validation' : 'pages.customers.form.fixFields',
      );
      return;
    }

    if (error.kind === 'conflict') {
      if (error.currentVersion === undefined) {
        // A conflict with no version is the other thing 409 means here: the
        // email address is taken.
        this.form.controls.email.setErrors({ emailTaken: true });
        this.form.controls.email.markAsTouched();
        this.submitError.set('pages.customers.form.fixFields');
        return;
      }
      this.conflict.set(true);
      return;
    }

    this.submitError.set(messageKeyOf(error));
  }

  // ---------------------------------------------------------------- actions

  /** Re-reads the record, keeping what the user has typed. See the class note. */
  protected reloadKeepingChanges(): void {
    this.conflict.set(false);
    this.awaitingReload.set(true);
    this.store.refreshDetail();
  }

  protected reload(): void {
    this.store.refreshDetail();
  }

  protected resetForm(): void {
    const record = this.baseline();
    this.submitted.set(false);
    this.submitError.set(null);
    this.conflict.set(false);
    if (record && this.mode() === 'edit') {
      this.form.reset(toFormValue(record));
    } else {
      this.form.reset();
    }
  }

  // ----------------------------------------------------------- leaving

  /**
   * Asks the browser to confirm leaving the page with unsaved changes.
   *
   * The browser shows its own, untranslatable dialog - no page may choose
   * the wording - and shows it only if the user has interacted with the
   * page. `preventDefault()` is the standard way to ask; `returnValue` is
   * what older Chromium and Safari still read. Registered through the
   * host binding, never on `window` directly, so the page still renders on
   * the server.
   */
  protected warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.form.dirty && !this.saving()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  canLeave(): boolean | Observable<boolean> {
    if (!this.form.dirty || this.saving()) {
      return true;
    }

    return this.confirmation.confirm({
      headingKey: 'pages.customers.form.leaveHeading',
      bodyKey: 'pages.customers.form.leaveBody',
      confirmKey: 'pages.customers.form.discard',
      cancelKey: 'pages.customers.form.stay',
      tone: 'danger',
    });
  }
}
