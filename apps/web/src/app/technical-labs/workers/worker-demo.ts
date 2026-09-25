import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { WINDOW } from '../../core/platform/platform.tokens';
import { Button } from '../../shared/ui/button/button';
import { countPrimes, type PrimeResponse } from './primes';

/** Large enough that the main-thread run visibly freezes the page. */
export const PRIME_LIMIT = 20_000_000;

type Where = 'main-thread' | 'worker';

interface RunResult {
  readonly where: Where;
  readonly count: number;
  readonly totalMs: number;
  /** The longest gap between two animation frames during the run: how long the page was frozen. */
  readonly longestFrameMs: number;
}

/**
 * The same computation on the main thread and in a Web Worker, with a frame
 * monitor running throughout (docs/browser-capabilities.md, "Web Worker").
 *
 * The monitor is `requestAnimationFrame` in a loop, recording the longest gap
 * between frames. At 60 Hz a healthy gap is about 17 ms; while the main
 * thread is busy counting, no frame can be produced, and the gap is the whole
 * computation. In the worker, the page keeps producing frames - the number
 * that proves the point is not how long the count took, but how long the
 * page stopped responding.
 *
 * The worker is created per run and terminated after it: a worker is a
 * thread, and one left alive holds memory for the life of the tab.
 */
@Component({
  selector: 'app-worker-demo',
  imports: [Button, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="demo" *transloco="let t; prefix: 'pages.labs.workers.worker'">
      <div class="actions">
        <app-button data-testid="primes-main" [disabled]="running()" (click)="run('main-thread')">
          {{ t('mainThread', { limit: limit }) }}
        </app-button>
        <app-button data-testid="primes-worker" [disabled]="running()" (click)="run('worker')">
          {{ t('worker', { limit: limit }) }}
        </app-button>
      </div>
      <div class="spinner" [class.spinner--running]="running()" aria-hidden="true"></div>
      @for (result of results(); track $index) {
        <p data-testid="primes-result" [attr.data-where]="result.where">
          {{
            t('result', {
              where: t('where.' + result.where),
              count: result.count,
              total: result.totalMs,
              frame: result.longestFrameMs,
            })
          }}
        </p>
      }
      @if (unsupported()) {
        <p role="alert">{{ t('unsupported') }}</p>
      }
    </div>
  `,
  styles: `
    .demo {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    /* A CSS animation runs on the compositor and would keep spinning even
       while the main thread is frozen - which is why the measurement uses
       requestAnimationFrame instead. This is only something to look at. */
    .spinner {
      width: 1.5rem;
      height: 1.5rem;
      border: 3px solid var(--border-subtle);
      border-top-color: var(--accent);
      border-radius: 50%;
    }

    .spinner--running {
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class WorkerDemo {
  private readonly win = inject(WINDOW);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly limit = PRIME_LIMIT;
  protected readonly running = signal(false);
  protected readonly unsupported = signal(false);
  protected readonly results = signal<readonly RunResult[]>([]);

  protected async run(where: Where): Promise<void> {
    const win = this.win;
    if (!win) {
      return;
    }
    this.running.set(true);
    const monitor = this.monitorFrames(win);
    // Let the button's pressed state and the first frames paint before the
    // main-thread run takes the thread away.
    await new Promise((resolve) => win.setTimeout(resolve, 50));
    const started = win.performance.now();

    const count = where === 'worker' ? await this.countInWorker() : countPrimes(PRIME_LIMIT);

    // One more frame after the work, so a freeze that ends here is measured.
    await new Promise((resolve) => win.requestAnimationFrame(resolve));
    const totalMs = Math.round(win.performance.now() - started);
    const longestFrameMs = monitor.stop();
    this.running.set(false);
    if (count !== null) {
      this.results.update((results) => [...results, { where, count, totalMs, longestFrameMs }]);
    }
  }

  private countInWorker(): Promise<number | null> {
    if (typeof Worker === 'undefined') {
      this.unsupported.set(true);
      return Promise.resolve(null);
    }
    // This exact shape - `new Worker(new URL(<literal>, import.meta.url))` - is
    // what the Angular CLI recognises and bundles as a separate worker chunk.
    const worker = new Worker(new URL('./primes.worker', import.meta.url), { type: 'module' });
    this.destroyRef.onDestroy(() => worker.terminate());
    return new Promise((resolve) => {
      worker.onmessage = ({ data }: MessageEvent<PrimeResponse>) => {
        worker.terminate();
        resolve(data.count);
      };
      worker.onerror = () => {
        worker.terminate();
        resolve(null);
      };
      worker.postMessage({ limit: PRIME_LIMIT });
    });
  }

  private monitorFrames(win: Window): { stop: () => number } {
    let longest = 0;
    let last = win.performance.now();
    // The clock is read inside the callback rather than taken from its
    // argument: the argument is the frame's scheduled time, which headless
    // Chromium synthesises at a steady 16.7 ms whether or not the thread was
    // free - it hid a 200 ms freeze completely.
    let handle = win.requestAnimationFrame(function tick() {
      const now = win.performance.now();
      longest = Math.max(longest, now - last);
      last = now;
      handle = win.requestAnimationFrame(tick);
    });
    return {
      stop: () => {
        win.cancelAnimationFrame(handle);
        return Math.round(longest);
      },
    };
  }
}
