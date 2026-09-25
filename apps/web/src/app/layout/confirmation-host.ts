import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ConfirmationService } from '../core/notifications/confirmation.service';
import { Button } from '../shared/ui/button/button';
import { Dialog } from '../shared/ui/dialog/dialog';

/**
 * Renders the one confirmation question `ConfirmationService` holds.
 *
 * Placed once, in the shell, so a component that needs to ask something asks
 * the service and never renders a dialog of its own. Closing the dialog any
 * way other than the confirm button - Escape, the close button, the backdrop -
 * is "no", because the question is always "do the thing?", and a user who
 * backs out has not said yes.
 */
@Component({
  selector: 'app-confirmation-host',
  imports: [Button, Dialog, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (request(); as ask) {
      <ng-container *transloco="let t">
        <!-- Created when there is a question and destroyed when it is
             answered, so the focus trap captures focus on the way in and
             gives it back to the control that asked on the way out. -->
        <app-dialog
          [open]="true"
          [heading]="t(ask.headingKey, ask.params ?? {})"
          (closed)="confirmation.answer(false)"
        >
          <p>{{ t(ask.bodyKey, ask.params ?? {}) }}</p>
          <div dialogActions>
            <app-button (click)="confirmation.answer(false)" data-testid="confirm-cancel">
              {{ t(ask.cancelKey ?? 'common.cancel') }}
            </app-button>
            <app-button
              [variant]="ask.tone === 'danger' ? 'danger' : 'primary'"
              (click)="confirmation.answer(true)"
              data-testid="confirm-accept"
            >
              {{ t(ask.confirmKey) }}
            </app-button>
          </div>
        </app-dialog>
      </ng-container>
    }
  `,
})
export class ConfirmationHost {
  protected readonly confirmation = inject(ConfirmationService);
  protected readonly request = computed(() => this.confirmation.pending()?.request ?? null);
}
