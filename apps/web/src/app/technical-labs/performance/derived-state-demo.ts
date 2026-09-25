import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { Button } from '../../shared/ui/button/button';
import { injectLabClock } from './lab-clock';
import { summarize, type DatasetRow, type DatasetSummary } from './performance-dataset';

/** How many unrelated re-renders one run forces. */
export const RERENDERS = 50;

type Strategy = 'method' | 'computed';

/**
 * The same derived value - a summary of every row - two ways:
 *
 *  - a **method called from the template**, which Angular must call on every
 *    render of the component, because it cannot know the result would be the
 *    same;
 *  - a **`computed()` signal**, which is memoized: re-evaluated only when a
 *    signal it read has changed, and otherwise answered from its cache.
 *
 * A run renders the component {@link RERENDERS} times for a reason that has
 * nothing to do with the rows - a counter changes - and counts how often the
 * summary was recomputed, and how long the renders took. `ApplicationRef.
 * tick()` forces each render synchronously so the loop can time it.
 *
 * The counters are plain fields, not signals, on purpose: writing a signal
 * while a template is being evaluated is an error, and it is precisely during
 * evaluation that the method is called.
 */
@Component({
  selector: 'app-derived-state-demo',
  imports: [Button, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="demo" *transloco="let t; prefix: 'pages.labs.performance.derived'">
      <div class="demo__controls">
        <app-button data-testid="derived-run-method" (click)="run('method')">
          {{ t('runMethod', { count: rerenders }) }}
        </app-button>
        <app-button data-testid="derived-run-computed" (click)="run('computed')">
          {{ t('runComputed', { count: rerenders }) }}
        </app-button>
      </div>

      <!-- Only the active strategy is in the template, so each run measures one. -->
      @if (strategy() === 'method') {
        <p>{{ t('total', { cents: summaryByMethod().totalCents, tick: tick() }) }}</p>
      } @else if (strategy() === 'computed') {
        <p>{{ t('total', { cents: summary().totalCents, tick: tick() }) }}</p>
      }

      @if (result(); as last) {
        <p aria-live="polite" data-testid="derived-result">
          {{
            t('result', {
              strategy: t(last.strategy),
              recomputed: last.recomputed,
              renders: rerenders,
              ms: last.ms,
            })
          }}
        </p>
      }
    </div>
  `,
  styles: `
    .demo {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .demo__controls {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class DerivedStateDemo {
  readonly rows = input.required<readonly DatasetRow[]>();

  private readonly appRef = inject(ApplicationRef);
  private readonly now = injectLabClock();

  protected readonly rerenders = RERENDERS;
  protected readonly strategy = signal<Strategy | null>(null);
  /** The unrelated state: read by the template, irrelevant to the summary. */
  protected readonly tick = signal(0);
  protected readonly result = signal<{ strategy: Strategy; recomputed: number; ms: number } | null>(
    null,
  );

  private recomputed = 0;

  protected readonly summary = computed(() => {
    this.recomputed++;
    return summarize(this.rows());
  });

  protected summaryByMethod(): DatasetSummary {
    this.recomputed++;
    return summarize(this.rows());
  }

  protected run(strategy: Strategy): void {
    this.strategy.set(strategy);
    this.appRef.tick();

    this.recomputed = 0;
    const started = this.now();
    for (let render = 1; render <= RERENDERS; render++) {
      this.tick.set(render);
      this.appRef.tick();
    }
    this.result.set({
      strategy,
      recomputed: this.recomputed,
      ms: Math.round(this.now() - started),
    });
  }
}
