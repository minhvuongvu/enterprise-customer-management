import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  NotificationService,
  type TransientMessage,
} from '../core/notifications/notification.service';

/**
 * Where toasts and snackbars appear.
 *
 * Two live regions, not one, because they are announced differently: news and
 * confirmations are `polite` - read when the screen reader is idle - while a
 * failure is `assertive`, because a user who does not hear that their change
 * was rolled back will believe it was saved. Both regions exist in the DOM
 * before anything is put in them; a live region created at the same moment as
 * its content is often not announced at all.
 *
 * Every message can be dismissed, and a snackbar's action is a real button.
 * Automatic dismissal is a convenience for sighted users; anything that must
 * not be missed also goes to the notification centre, where it waits.
 */
@Component({
  selector: 'app-toast-region',
  imports: [NgTemplateOutlet, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="region" *transloco="let t">
      <div class="region__stack" role="status" aria-live="polite" data-testid="toasts">
        @for (message of polite(); track message.id) {
          <ng-container *ngTemplateOutlet="item; context: { $implicit: message }"></ng-container>
        }
      </div>
      <div class="region__stack" role="alert" aria-live="assertive" data-testid="alerts">
        @for (message of urgent(); track message.id) {
          <ng-container *ngTemplateOutlet="item; context: { $implicit: message }"></ng-container>
        }
      </div>

      <ng-template #item let-message>
        <div class="toast" [attr.data-tone]="message.tone" [attr.data-kind]="message.kind">
          <p class="toast__text">{{ t(message.messageKey, message.params) }}</p>
          @if (message.action; as action) {
            <button
              type="button"
              class="toast__action"
              (click)="notifications.act(message.id)"
              data-testid="snackbar-action"
            >
              {{ t(action.labelKey) }}
            </button>
          }
          <button
            type="button"
            class="toast__dismiss"
            [attr.aria-label]="t('notifications.dismiss')"
            (click)="notifications.dismiss(message.id)"
          >
            <span aria-hidden="true" class="toast__dismiss-icon"></span>
          </button>
        </div>
      </ng-template>
    </div>
  `,
  styles: `
    .region {
      position: fixed;
      inset-block-end: var(--space-4);
      inset-inline-end: var(--space-4);
      z-index: var(--z-overlay);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      width: min(24rem, calc(100vw - 2 * var(--space-4)));
      pointer-events: none;
    }

    .region__stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .toast {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3);
      border: var(--border-width) solid var(--border-subtle);
      border-inline-start-width: 4px;
      border-radius: var(--radius-md);
      background-color: var(--surface-overlay);
      box-shadow: var(--shadow-lg);
      color: var(--text-primary);
      pointer-events: auto;
    }

    .toast[data-tone='success'] {
      border-inline-start-color: var(--success);
    }
    .toast[data-tone='info'] {
      border-inline-start-color: var(--accent);
    }
    .toast[data-tone='warning'] {
      border-inline-start-color: var(--warning);
    }
    .toast[data-tone='danger'] {
      border-inline-start-color: var(--danger);
    }

    .toast__text {
      flex: 1;
      margin: 0;
      font-size: var(--text-sm);
    }

    .toast__action {
      padding: var(--space-1) var(--space-2);
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--accent-text);
      font-weight: var(--weight-semibold);
      cursor: pointer;
    }

    .toast__action:hover,
    .toast__dismiss:hover {
      background-color: var(--surface-hover);
    }

    .toast__dismiss {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: 1.75rem;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
    }

    /* A cross from two bars, as in app-dialog: no glyph to translate. */
    .toast__dismiss-icon {
      position: relative;
      width: 0.875rem;
      height: 0.875rem;
    }
    .toast__dismiss-icon::before,
    .toast__dismiss-icon::after {
      content: '';
      position: absolute;
      inset-block-start: 50%;
      inset-inline-start: 0;
      width: 100%;
      height: 2px;
      background-color: currentcolor;
    }
    .toast__dismiss-icon::before {
      transform: rotate(45deg);
    }
    .toast__dismiss-icon::after {
      transform: rotate(-45deg);
    }
  `,
})
export class ToastRegion {
  protected readonly notifications = inject(NotificationService);

  protected readonly polite = computed(() =>
    this.notifications.messages().filter((message) => !isUrgent(message)),
  );
  protected readonly urgent = computed(() =>
    this.notifications.messages().filter((message) => isUrgent(message)),
  );
}

function isUrgent(message: TransientMessage): boolean {
  return message.tone === 'danger';
}
