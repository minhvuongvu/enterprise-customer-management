import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { Button } from '../../shared/ui/button/button';
import { Dialog } from '../../shared/ui/dialog/dialog';

/**
 * A single customer - routing and page structure only.
 *
 * `id` comes from `/customers/:id` as a component input, which is what makes
 * the page a deep link: arriving from the list, from a bookmark or from a
 * reload are the same thing to this component.
 *
 * The delete confirmation is wired up but deliberately inert. It is here so
 * the modal behaviour lives on a real page rather than only in a unit test -
 * open it with the keyboard and focus moves in, Escape closes it, and focus
 * returns to the button that opened it. Phase 2 replaces the inert confirm
 * with a real one; nothing about the dialog changes.
 */
@Component({
  selector: 'app-customer-detail-page',
  imports: [Button, Dialog, PageContainer, PageHeader, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t">
      <app-page-header
        [heading]="t('pages.customers.detail.heading')"
        [description]="t('pages.customers.detail.description')"
      >
        <div pageActions>
          <app-button [link]="['/customers', id(), 'edit']">
            {{ t('pages.customers.detail.edit') }}
          </app-button>
          <app-button [link]="['/customers', id(), 'audit']">
            {{ t('pages.customers.detail.audit') }}
          </app-button>
          <app-button variant="danger" (click)="confirmingDelete.set(true)">
            {{ t('pages.customers.detail.delete') }}
          </app-button>
        </div>
      </app-page-header>

      <p data-testid="customer-id">{{ t('pages.customers.detail.identifier', { id: id() }) }}</p>
      <p>{{ t('pages.customers.detail.placeholder') }}</p>

      <app-dialog
        [open]="confirmingDelete()"
        [heading]="t('pages.customers.detail.deleteHeading')"
        (closed)="confirmingDelete.set(false)"
      >
        <p>{{ t('pages.customers.detail.deleteBody') }}</p>

        <div dialogActions>
          <app-button (click)="confirmingDelete.set(false)">
            {{ t('common.cancel') }}
          </app-button>
          <app-button variant="danger" [disabled]="true">
            {{ t('pages.customers.detail.delete') }}
          </app-button>
        </div>
      </app-dialog>
    </app-page-container>
  `,
})
export class CustomerDetailPage {
  /** Bound from the `:id` route parameter. */
  readonly id = input.required<string>();

  protected readonly confirmingDelete = signal(false);
}
