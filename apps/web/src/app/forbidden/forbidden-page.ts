import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { PageContainer } from '../layout/page-container';
import { PageHeader } from '../layout/page-header';
import { Button } from '../shared/ui/button/button';

/**
 * What a signed-in user sees when a route is not theirs to open.
 *
 * `requirePermission` renders this with the refused URL in the address bar,
 * so the URL the user tried is there to copy into a request for access.
 *
 * Deliberately distinct from "not found". Saying a page does not exist when it
 * does, to someone already signed in, protects nothing - the route table is in
 * the bundle they downloaded - and sends them looking for a typo that is not
 * there. Whether a *record* exists is a different question, and the API
 * answers that one.
 */
@Component({
  selector: 'app-forbidden-page',
  imports: [Button, PageContainer, PageHeader, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t">
      <app-page-header
        [heading]="t('pages.forbidden.heading')"
        [description]="t('pages.forbidden.body')"
      >
        <div pageActions>
          <app-button variant="primary" link="/customers">
            {{ t('pages.forbidden.backHome') }}
          </app-button>
        </div>
      </app-page-header>
    </app-page-container>
  `,
})
export class ForbiddenPage {}
