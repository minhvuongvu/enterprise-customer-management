import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { Button } from '../../shared/ui/button/button';

/** Which job this page is doing. Supplied by the route, not inferred. */
export type CustomerFormMode = 'create' | 'edit';

/**
 * Create and edit - one page, told which it is by the route.
 *
 * `/customers/new` and `/customers/:id/edit` render the same component with
 * `mode` bound from route `data`. Two nearly identical components would drift
 * the first time a field is added to one of them.
 *
 * The mode comes from route metadata rather than from "is there an `id`",
 * because the two are not the same question: Phase 2 will add a duplicate flow
 * that has an id and still creates a customer. Reading the intent beats
 * inferring it from a coincidence.
 *
 * The form itself is Phase 2's: reactive forms, validation, server-side field
 * errors, unsaved-change protection and conflict handling are that phase's
 * whole subject, and a placeholder form here would be thrown away.
 */
@Component({
  selector: 'app-customer-form-page',
  imports: [Button, PageContainer, PageHeader, TranslocoDirective],
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

      <!-- A dynamic key rather than a parameter: the mode is a machine value
           ('create'), and interpolating it would put it in front of a user. -->
      <p data-testid="form-mode">{{ t('pages.customers.form.mode.' + mode()) }}</p>
      <p>{{ t('pages.customers.form.placeholder') }}</p>
    </app-page-container>
  `,
})
export class CustomerFormPage {
  /** From route `data`. */
  readonly mode = input.required<CustomerFormMode>();
  /** From the `:id` route parameter - absent when creating. */
  readonly id = input<string>();

  protected readonly headingKey = computed(() =>
    this.mode() === 'create' ? 'pages.customers.create.heading' : 'pages.customers.edit.heading',
  );

  /** Cancelling returns to where the record lives, not to a fixed page. */
  protected readonly cancelLink = computed<unknown[]>(() => {
    const id = this.id();
    return id ? ['/customers', id] : ['/customers'];
  });
}
