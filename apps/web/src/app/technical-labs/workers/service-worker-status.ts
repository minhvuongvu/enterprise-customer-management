import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { TranslocoDirective } from '@jsverse/transloco';
import { NAVIGATOR, WINDOW } from '../../core/platform/platform.tokens';
import { Button } from '../../shared/ui/button/button';

interface ServiceWorkerSnapshot {
  readonly supported: boolean;
  readonly enabled: boolean;
  readonly controlled: boolean;
  readonly scope: string | null;
  readonly caches: readonly string[];
}

/**
 * What the service worker is doing for this page (docs/offline.md).
 *
 * Angular's service worker (`@angular/service-worker`) is registered by the
 * application in production builds. It caches the application shell, not API
 * data (ADR-0028). Under `ng serve` it is deliberately disabled, and this
 * panel says so - a lab that pretended otherwise would teach the wrong thing.
 *
 * `controlled` is the fact that matters: a page is served by a service worker
 * only once one has *claimed* it, which for a first visit means the next
 * load.
 */
@Component({
  selector: 'app-service-worker-status',
  imports: [Button, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="demo" *transloco="let t; prefix: 'pages.labs.workers.serviceWorker'">
      <dl class="readout" data-testid="sw-status">
        <div>
          <dt>{{ t('supported') }}</dt>
          <dd>{{ snapshot().supported ? t('yes') : t('no') }}</dd>
        </div>
        <div>
          <dt>{{ t('enabled') }}</dt>
          <dd data-testid="sw-enabled">{{ snapshot().enabled ? t('yes') : t('disabledInDev') }}</dd>
        </div>
        <div>
          <dt>{{ t('controlled') }}</dt>
          <dd data-testid="sw-controlled">{{ snapshot().controlled ? t('yes') : t('no') }}</dd>
        </div>
        <div>
          <dt>{{ t('caches') }}</dt>
          <dd>{{ snapshot().caches.length ? snapshot().caches.join(', ') : t('none') }}</dd>
        </div>
      </dl>
      <div class="actions">
        <app-button (click)="refresh()">{{ t('refresh') }}</app-button>
        @if (snapshot().enabled) {
          <app-button (click)="checkForUpdate()">{{ t('checkUpdate') }}</app-button>
        }
      </div>
      <ol class="log" aria-live="polite">
        @for (event of events(); track $index) {
          <li>{{ t('event.' + event) }}</li>
        }
      </ol>
    </div>
  `,
  styles: `
    .demo {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .readout {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-5);
      margin: 0;
    }

    dt {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    dd {
      margin: 0;
      font-weight: var(--weight-semibold);
    }

    .actions {
      display: flex;
      gap: var(--space-2);
    }
  `,
})
export class ServiceWorkerStatus {
  private readonly updates = inject(SwUpdate);
  private readonly container = inject(NAVIGATOR)?.serviceWorker ?? null;
  private readonly cacheStorage = inject(WINDOW)?.caches ?? null;

  protected readonly snapshot = signal<ServiceWorkerSnapshot>({
    supported: this.container !== null,
    enabled: this.updates.isEnabled,
    controlled: false,
    scope: null,
    caches: [],
  });
  protected readonly events = signal<readonly string[]>([]);

  constructor() {
    this.updates.versionUpdates
      .pipe(takeUntilDestroyed())
      .subscribe((event) => this.events.update((events) => [...events, event.type]));
    void this.refresh();
  }

  protected async refresh(): Promise<void> {
    const registration = await this.container?.getRegistration();
    const caches = this.cacheStorage ? await this.cacheStorage.keys() : [];
    this.snapshot.set({
      supported: this.container !== null,
      enabled: this.updates.isEnabled,
      controlled: Boolean(this.container?.controller),
      scope: registration?.scope ?? null,
      caches,
    });
  }

  protected async checkForUpdate(): Promise<void> {
    const found = await this.updates.checkForUpdate();
    this.events.update((events) => [...events, found ? 'UPDATE_FOUND' : 'NO_UPDATE']);
  }
}
