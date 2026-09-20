import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoDirective } from '@jsverse/transloco';
import { HealthApi } from '../core/api/health.api';
import { Logger } from '../core/logging/logger';

type ApiStatus = 'checking' | 'connected' | 'unavailable';

/**
 * Placeholder for the authenticated area.
 *
 * Its jobs in Phase 0.5 are both temporary: to be a route that `authGuard`
 * protects, and to make one real call to the mock API so the wiring - dev
 * proxy, runtime configuration, HTTP interceptors, response validation - is
 * proven rather than assumed. Phase 1 replaces this with the application shell.
 */
@Component({
  selector: 'app-home-page',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section *transloco="let t">
      <h1>{{ t('pages.home.heading') }}</h1>
      <p>{{ t('pages.home.placeholder') }}</p>

      <p data-testid="api-status">{{ t('pages.home.apiStatus.' + apiStatus()) }}</p>

      @if (customerCount() !== null) {
        <p data-testid="api-customers">
          {{ t('pages.home.customerCount', { count: customerCount() }) }}
        </p>
      }
    </section>
  `,
})
export class HomePage {
  private readonly health = inject(HealthApi);
  private readonly logger = inject(Logger);

  protected readonly apiStatus = signal<ApiStatus>('checking');
  protected readonly customerCount = signal<number | null>(null);

  constructor() {
    this.health
      .check()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (health) => {
          this.apiStatus.set('connected');
          this.customerCount.set(health.customers);
        },
        error: () => {
          // The error has already been classified and logged by the HTTP layer.
          // What is left is the UI decision, which belongs here.
          this.apiStatus.set('unavailable');
          this.logger.info('Mock API is not reachable', { route: '/home' });
        },
      });
  }
}
