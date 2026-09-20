import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * Placeholder for the public sign-in surface.
 *
 * This route exists in Phase 0 so that the public/authenticated split is real
 * from the start: it is the one route that is prerendered (app.routes.server).
 * Phase 3 gives it a form.
 */
@Component({
  selector: 'app-login-page',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section *transloco="let t">
      <h1>{{ t('pages.login.heading') }}</h1>
      <p>{{ t('pages.login.placeholder') }}</p>
    </section>
  `,
})
export class LoginPage {}
