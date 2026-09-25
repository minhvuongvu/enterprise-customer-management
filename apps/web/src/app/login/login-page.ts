import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { safeReturnUrl } from '../core/auth/return-url';
import { SessionService } from '../core/auth/session.service';
import { isAppError } from '../core/errors/app-error';
import { ThemeToggle } from '../layout/theme-toggle';
import { Button } from '../shared/ui/button/button';
import { TextInput } from '../shared/ui/text-input/text-input';

/**
 * The public sign-in surface.
 *
 * It sits outside the application shell, which is why it carries its own
 * `<main>` landmark: there is exactly one per page, and the shell's belongs to
 * the authenticated area. That separation is also what makes this the one
 * route worth prerendering (`app.routes.server.ts`) - it is identical for
 * everyone and has nothing to wait for.
 *
 * ## Where it sends the user
 *
 * To `returnUrl` when there is one - the page the guard or an expired session
 * sent them from - and otherwise to the customer list. The parameter is a
 * value anyone can put in a link, so it is followed only after `safeReturnUrl`
 * has confirmed it is a path inside this application; see `return-url.ts` for
 * the open-redirect it prevents.
 *
 * `reason=expired` adds one sentence saying why they are here. Arriving at a
 * sign-in form unannounced, mid-task, reads as a malfunction.
 *
 * The mock backend does not verify passwords, which is documented in
 * `docs/mock-backend.md` and is the reason there is no credential anywhere in
 * this repository. The hint below says so rather than leaving a reader to
 * discover it by trying.
 *
 * ## Why the submit button starts disabled
 *
 * This route is prerendered, so the form is on screen and looks usable before
 * any script has run. A submit button pressed in that window submits the form
 * the way a browser does with no JavaScript: a GET to the same URL - which
 * puts the username **and the password in the address bar**, in history, and
 * in any proxy log along the way.
 *
 * `afterNextRender` runs only in the browser and only once the application is
 * live, so the prerendered HTML ships the button disabled and hydration
 * enables it. The cost is a few milliseconds of an inert button; the
 * alternative is a credential in a URL.
 */
@Component({
  selector: 'app-login-page',
  imports: [Button, ReactiveFormsModule, TextInput, ThemeToggle, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="login" *transloco="let t">
      <section class="login__card">
        <div class="login__top">
          <h1>{{ t('pages.login.heading') }}</h1>
          <app-theme-toggle />
        </div>

        @if (expired()) {
          <p class="login__notice" role="status" data-testid="session-expired">
            {{ t('pages.login.sessionExpired') }}
          </p>
        }

        <p class="login__note">{{ t('pages.login.intro') }}</p>

        <form class="login__form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <app-text-input
            name="username"
            formControlName="username"
            autocomplete="username"
            [label]="t('pages.login.username')"
            [required]="true"
            [hint]="t('pages.login.usernameHint')"
            [error]="usernameError() ? t('pages.login.usernameRequired') : ''"
          />

          <app-text-input
            type="password"
            name="password"
            formControlName="password"
            autocomplete="current-password"
            [label]="t('pages.login.password')"
            [required]="true"
            [hint]="t('pages.login.passwordHint')"
            [error]="passwordError() ? t('pages.login.passwordRequired') : ''"
          />

          @if (failure(); as key) {
            <p class="login__error" role="alert" data-testid="login-error">{{ t(key) }}</p>
          }

          <app-button
            type="submit"
            variant="primary"
            [fullWidth]="true"
            [loading]="submitting()"
            [disabled]="!ready()"
            data-testid="sign-in"
          >
            {{ t('pages.login.submit') }}
          </app-button>
        </form>
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

    .login__note {
      color: var(--text-secondary);
    }

    .login__notice {
      padding: var(--space-2) var(--space-3);
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-md);
      background-color: var(--surface-sunken);
      color: var(--text-primary);
      font-size: var(--text-sm);
    }

    .login__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      margin-top: var(--space-2);
    }

    .login__error {
      color: var(--danger-text);
      font-size: var(--text-sm);
    }
  `,
})
export class LoginPage {
  /** Query parameters, bound by `withComponentInputBinding`. Untrusted input. */
  readonly returnUrl = input<string>();
  readonly reason = input<string>();

  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  /** False until the application is running in the browser. See the note above. */
  protected readonly ready = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly expired = computed(() => this.reason() === 'expired');

  constructor() {
    afterNextRender(() => this.ready.set(true));
  }

  protected usernameError(): boolean {
    return this.submitted() && this.form.controls.username.invalid;
  }

  protected passwordError(): boolean {
    return this.submitted() && this.form.controls.password.invalid;
  }

  protected submit(): void {
    this.submitted.set(true);
    this.failure.set(null);

    if (this.form.invalid || this.submitting()) {
      return;
    }

    const { username, password } = this.form.getRawValue();
    this.submitting.set(true);

    this.session
      .signIn(username, password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          void this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          // The server answers 401 for both an unknown user and a wrong
          // password, deliberately, so that the response cannot be used to
          // find out which accounts exist. The client says the same thing.
          this.failure.set(
            isAppError(error) && error.kind === 'authentication'
              ? 'pages.login.invalidCredentials'
              : 'errors.network',
          );
        },
      });
  }
}
