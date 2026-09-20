import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoDirective } from '@jsverse/transloco';
import { HealthApi } from '../../core/api/health.api';
import { Logger } from '../../core/logging/logger';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { Button } from '../../shared/ui/button/button';

type ApiStatus = 'checking' | 'connected' | 'unavailable';

/**
 * Checks that the application can actually reach the mock API.
 *
 * It is a lab rather than a page in the customer feature because it belongs to
 * nothing in the business workflow: it exists to prove the plumbing - dev
 * proxy, runtime-configured base URL, correlation-id and error-mapping
 * interceptors, and response validation against the contract.
 *
 * Phase 0.5 owned this check as a placeholder home page. It moved here when
 * Phase 1 gave the application a real shell, because a lab is exactly what
 * "useful technique with no home in the domain" means in this repository.
 *
 * Note what the page never does: it does not render the server's message. The
 * HTTP layer has already turned the failure into an `AppError`; the only thing
 * left is the UI decision, and it is made here from a translation key.
 */
@Component({
  selector: 'app-api-connectivity-lab',
  imports: [Button, PageContainer, PageHeader, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t">
      <app-page-header
        [heading]="t('pages.labs.apiConnectivity.heading')"
        [description]="t('pages.labs.apiConnectivity.description')"
      >
        <div pageActions>
          <app-button [loading]="status() === 'checking'" (click)="check()">
            {{ t('pages.labs.apiConnectivity.recheck') }}
          </app-button>
        </div>
      </app-page-header>

      <!-- aria-live because the text changes without the user moving focus;
           polite because a connectivity result is not worth interrupting. -->
      <section class="result" aria-live="polite">
        <p data-testid="api-status">{{ t('pages.labs.apiConnectivity.status.' + status()) }}</p>

        @if (customerCount() !== null) {
          <p data-testid="api-customers">
            {{ t('pages.labs.apiConnectivity.customerCount', { count: customerCount() }) }}
          </p>
        }
      </section>
    </app-page-container>
  `,
  styles: `
    .result {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-4);
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-lg);
      background-color: var(--surface-raised);
    }
  `,
})
export class ApiConnectivityLab {
  private readonly health = inject(HealthApi);
  private readonly logger = inject(Logger);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<ApiStatus>('checking');
  protected readonly customerCount = signal<number | null>(null);

  constructor() {
    this.check();
  }

  protected check(): void {
    this.status.set('checking');

    this.health
      .check()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (health) => {
          this.status.set('connected');
          this.customerCount.set(health.customers);
        },
        error: () => {
          // Already classified and logged by the HTTP layer. What is left is
          // the UI decision, which belongs here.
          this.status.set('unavailable');
          this.customerCount.set(null);
          this.logger.info('Mock API is not reachable', {
            route: '/technical-labs/api-connectivity',
          });
        },
      });
  }
}
