import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * Placeholder for the authenticated area.
 *
 * Its only job in Phase 0 is to be a route that `authGuard` protects, proving
 * the guard is wired before it does anything. Phase 1 replaces it with the
 * application shell and Phase 2 with the customer list.
 */
@Component({
  selector: 'app-home-page',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section *transloco="let t">
      <h1>{{ t('pages.home.heading') }}</h1>
      <p>{{ t('pages.home.placeholder') }}</p>
    </section>
  `,
})
export class HomePage {}
