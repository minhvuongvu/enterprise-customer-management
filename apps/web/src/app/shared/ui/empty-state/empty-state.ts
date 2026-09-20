import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * "There is nothing here" - said on purpose.
 *
 * An empty list that renders as blank space is indistinguishable from one that
 * failed to load, and users read it as a bug. This component exists so that
 * every list in the application answers the same three questions: what is
 * missing, why, and what the user can do next.
 *
 * `heading` and `description` arrive already translated. The action is
 * projected, so the caller keeps the decision about what it is and whether the
 * user is allowed to take it.
 */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <h2 class="empty__heading">{{ heading() }}</h2>
      @if (description()) {
        <p class="empty__description">{{ description() }}</p>
      }
      <div class="empty__action"><ng-content /></div>
    </div>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-7) var(--space-4);
      border: var(--border-width) dashed var(--border-subtle);
      border-radius: var(--radius-lg);
      text-align: center;
    }

    .empty__heading {
      font-size: var(--text-lg);
    }

    .empty__description {
      max-width: 42ch;
      color: var(--text-secondary);
    }

    .empty__action:empty {
      display: none;
    }

    .empty__action {
      margin-top: var(--space-2);
    }
  `,
})
export class EmptyState {
  readonly heading = input.required<string>();
  readonly description = input('');
}
