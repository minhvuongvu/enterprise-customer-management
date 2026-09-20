import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from '../button/button';

/**
 * A failure the user can see and act on.
 *
 * It takes a *message*, never an error object. That is the shape of rule 6 in
 * a component signature: if this accepted an `AppError` or an
 * `HttpErrorResponse`, someone would eventually render `error.message`, and a
 * stack trace or a database constraint name would reach a user. The caller
 * maps the error to a translated sentence; this only renders it.
 *
 * `role="alert"` so a failure that replaces content is announced rather than
 * silently swapped in.
 */
@Component({
  selector: 'app-error-state',
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="error" role="alert">
      <h2 class="error__heading">{{ heading() }}</h2>
      @if (description()) {
        <p class="error__description">{{ description() }}</p>
      }
      @if (retryLabel()) {
        <app-button variant="secondary" (click)="retry.emit()">{{ retryLabel() }}</app-button>
      }
    </div>
  `,
  styles: `
    .error {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-6) var(--space-4);
      border: var(--border-width) solid var(--danger);
      border-radius: var(--radius-lg);
      background-color: var(--danger-subtle);
      text-align: center;
    }

    .error__heading {
      color: var(--danger-text);
      font-size: var(--text-lg);
    }

    .error__description {
      max-width: 48ch;
      color: var(--text-secondary);
    }
  `,
})
export class ErrorState {
  readonly heading = input.required<string>();
  readonly description = input('');
  /** Omit to hide the retry action - not every failure is worth retrying. */
  readonly retryLabel = input('');

  readonly retry = output<void>();
}
