import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { RealtimeClient } from '../core/realtime/realtime-client';

/**
 * Whether live updates are arriving.
 *
 * Shown because its absence misleads: a user who believes the list updates
 * itself trusts a list that stopped updating an hour ago. Quiet when all is
 * well - a small dot and a word - and announced politely when it changes.
 */
@Component({
  selector: 'app-connection-status',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p
      class="status"
      role="status"
      [attr.data-state]="realtime.status()"
      data-testid="connection-status"
      *transloco="let t"
    >
      <span class="status__dot" aria-hidden="true"></span>
      <span class="status__label">{{ t(labelKey()) }}</span>
    </p>
  `,
  styles: `
    @use 'styles/breakpoints' as bp;

    .status {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-xs);
      white-space: nowrap;
    }

    .status__dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background-color: var(--text-secondary);
    }

    .status[data-state='open'] .status__dot {
      background-color: var(--success);
    }

    .status[data-state='reconnecting'] .status__dot,
    .status[data-state='connecting'] .status__dot {
      background-color: var(--warning);
    }

    /* On a phone the dot carries it; the word is still read out. */
    @media #{bp.$below-tablet} {
      .status__label {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }
  `,
})
export class ConnectionStatus {
  protected readonly realtime = inject(RealtimeClient);

  protected readonly labelKey = computed(() => `realtime.status.${this.realtime.status()}`);
}
