import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { WINDOW } from '../../core/platform/platform.tokens';
import { Button } from '../../shared/ui/button/button';

/**
 * The History API, as an Angular application should use it: through the
 * router.
 *
 * Every router navigation is a `history.pushState()` (or `replaceState` with
 * `replaceUrl`), and the back button is a `popstate` the router listens for.
 * Calling `history.pushState` directly would change the address bar behind
 * the router's back - the URL and the rendered route would disagree until
 * the next navigation. So this demo only *reads* `window.history` and writes
 * through `Router`:
 *
 *  - a query parameter is the state that must survive a reload or a shared
 *    link;
 *  - navigation `state` is stored in `history.state` - it survives back and
 *    forward, but is never in the URL, so a reload in a new tab loses it.
 */
@Component({
  selector: 'app-history-demo',
  imports: [Button, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="demo" *transloco="let t; prefix: 'pages.labs.browserApis.history'">
      <div class="actions">
        <app-button data-testid="history-push" (click)="push()">{{ t('push') }}</app-button>
        <app-button data-testid="history-back" (click)="back()">{{ t('back') }}</app-button>
      </div>
      <dl class="readout">
        <div>
          <dt>{{ t('step') }}</dt>
          <dd data-testid="history-step">{{ step() ?? t('none') }}</dd>
        </div>
        <div>
          <dt>{{ t('length') }}</dt>
          <dd data-testid="history-length">{{ snapshot().length }}</dd>
        </div>
        <div>
          <dt>{{ t('state') }}</dt>
          <dd data-testid="history-state">{{ snapshot().note ?? t('none') }}</dd>
        </div>
      </dl>
    </div>
  `,
  styles: `
    .demo {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .actions,
    .readout {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
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
  `,
})
export class HistoryDemo {
  /** The `step` query parameter, bound by the router. */
  readonly step = input<string>();

  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly history = inject(WINDOW)?.history ?? null;

  protected readonly snapshot = signal(this.read());

  constructor() {
    // Back and forward change the URL without a click here; re-read then too.
    const subscription = this.location.subscribe(() => this.snapshot.set(this.read()));
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  protected push(): void {
    const next = Number(this.step() ?? 0) + 1;
    void this.router
      .navigate([], {
        queryParams: { step: next },
        queryParamsHandling: 'merge',
        state: { labNote: `step ${next}` },
      })
      .then(() => this.snapshot.set(this.read()));
  }

  protected back(): void {
    this.location.back();
  }

  private read(): { length: number; note: string | null } {
    const state = this.history?.state as { labNote?: unknown } | null | undefined;
    return {
      length: this.history?.length ?? 0,
      note: typeof state?.labNote === 'string' ? state.labNote : null,
    };
  }
}
