import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ThemeToggle } from '../layout/theme-toggle';

/**
 * The public sign-in surface.
 *
 * It sits outside the application shell, which is why it carries its own
 * `<main>` landmark: there is exactly one per page, and the shell's belongs to
 * the authenticated area. That separation is also what makes this the one
 * route worth prerendering (`app.routes.server.ts`) - it is identical for
 * everyone and has nothing to wait for.
 *
 * Phase 3 gives it a form. The theme control is here already because a user
 * who prefers a dark interface should not have to sign in to a bright one.
 */
@Component({
  selector: 'app-login-page',
  imports: [ThemeToggle, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="login" *transloco="let t">
      <section class="login__card">
        <div class="login__top">
          <h1>{{ t('pages.login.heading') }}</h1>
          <app-theme-toggle />
        </div>
        <p>{{ t('pages.login.placeholder') }}</p>
      </section>
    </main>
  `,
  styles: `
    .login {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: var(--space-4);
    }

    .login__card {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      width: min(26rem, 100%);
      padding: var(--space-6);
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-lg);
      background-color: var(--surface-raised);
      box-shadow: var(--shadow-md);
    }

    .login__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .login__card p {
      color: var(--text-secondary);
    }
  `,
})
export class LoginPage {}
