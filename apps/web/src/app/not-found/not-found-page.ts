import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { PageContainer } from '../layout/page-container';
import { PageHeader } from '../layout/page-header';
import { Button } from '../shared/ui/button/button';

/**
 * The wildcard route.
 *
 * It renders inside the shell, so a mistyped URL leaves the user with the
 * navigation they need to recover. A full-page dead end is the version of this
 * screen that gets a support ticket.
 *
 * It uses `app-page-header` rather than `app-empty-state` for one reason worth
 * stating: this page needs the document's `<h1>`, and an empty state renders
 * an `<h2>` because it is a region *within* a page, not a page.
 */
@Component({
  selector: 'app-not-found-page',
  imports: [Button, PageContainer, PageHeader, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t">
      <app-page-header
        [heading]="t('pages.notFound.heading')"
        [description]="t('pages.notFound.body')"
      >
        <div pageActions>
          <app-button variant="primary" link="/customers">
            {{ t('pages.notFound.backHome') }}
          </app-button>
        </div>
      </app-page-header>
    </app-page-container>
  `,
})
export class NotFoundPage {}
