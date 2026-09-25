import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoDirective } from '@jsverse/transloco';
import { ConnectivityService } from '../core/connectivity/connectivity.service';
import { NotificationService } from '../core/notifications/notification.service';

/**
 * Says so when the browser is offline, on every page of the application
 * (docs/offline.md).
 *
 * What it promises is deliberately narrow: nothing can be saved, and what is
 * on screen may be out of date. The application is not offline-capable - a
 * page not yet visited will not load, and a save will fail through the
 * ordinary error path - so the banner does not suggest otherwise.
 *
 * Coming back online is announced once, as a toast, and the banner goes. The
 * realtime stream reconnects by itself and replays what it missed (ADR-0020),
 * so there is nothing for the user to do.
 */
@Component({
  selector: 'app-offline-banner',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!connectivity.online()) {
      <p class="offline" role="status" data-testid="offline-banner" *transloco="let t">
        {{ t('connectivity.offline') }}
      </p>
    }
  `,
  styles: `
    .offline {
      margin: 0;
      padding: var(--space-2) var(--space-4);
      background-color: var(--warning-subtle);
      color: var(--warning-text);
      font-size: var(--text-sm);
      text-align: center;
    }
  `,
})
export class OfflineBanner {
  protected readonly connectivity = inject(ConnectivityService);

  constructor() {
    const notifications = inject(NotificationService);
    this.connectivity.reconnected$
      .pipe(takeUntilDestroyed())
      .subscribe(() => notifications.toast('connectivity.backOnline', { tone: 'success' }));
  }
}
