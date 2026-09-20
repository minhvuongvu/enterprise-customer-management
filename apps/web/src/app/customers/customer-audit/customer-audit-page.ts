import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { Button } from '../../shared/ui/button/button';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';

/**
 * A customer's audit trail - routing and page structure only.
 *
 * It is a sibling route of the detail page rather than a tab inside it,
 * because the audit trail is a place a user can be sent to: `/customers/:id/
 * audit` is a link, a bookmark and a browser-history entry. A tab held in a
 * component signal is none of those.
 *
 * The mock API already serves `GET /api/customers/:id/audit`, newest first.
 * Phase 2 reads it.
 */
@Component({
  selector: 'app-customer-audit-page',
  imports: [Button, EmptyState, PageContainer, PageHeader, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t">
      <app-page-header
        [heading]="t('pages.customers.audit.heading')"
        [description]="t('pages.customers.audit.description')"
      >
        <div pageActions>
          <app-button [link]="['/customers', id()]">
            {{ t('pages.customers.audit.backToCustomer') }}
          </app-button>
        </div>
      </app-page-header>

      <p data-testid="audit-customer-id">
        {{ t('pages.customers.audit.identifier', { id: id() }) }}
      </p>

      <app-empty-state
        [heading]="t('pages.customers.audit.placeholderHeading')"
        [description]="t('pages.customers.audit.placeholderBody')"
      />
    </app-page-container>
  `,
})
export class CustomerAuditPage {
  readonly id = input.required<string>();
}
