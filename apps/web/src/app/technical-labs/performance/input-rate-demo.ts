import {
  ChangeDetectionStrategy,
  Component,
  input,
  signal,
  type WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { debounceTime, Subject, throttleTime } from 'rxjs';
import { TextInput } from '../../shared/ui/text-input/text-input';
import { injectLabClock } from './lab-clock';
import { filterRows, type DatasetRow } from './performance-dataset';

interface ScanTotals {
  readonly scans: number;
  readonly totalMs: number;
  readonly matches: number;
}

/** How long typing must pause before the debounced search runs. Same as the customer list. */
export const SEARCH_DEBOUNCE_MS = 250;
/** At most one handled pointer event per this many milliseconds. */
export const POINTER_THROTTLE_MS = 100;

/**
 * Debouncing and throttling, side by side with doing neither.
 *
 * - **Debounce** waits for a burst to end: a search runs once, when typing
 *   pauses, instead of once per keystroke. Every keystroke of the immediate
 *   search below scans all rows; the counters show how many scans the pause
 *   saved and what they cost.
 * - **Throttle** lets through at most one event per interval *during* a
 *   burst: a pointer tracker updates ten times a second instead of at the
 *   event rate. It suits continuous feedback, where debouncing would show
 *   nothing until the pointer stopped.
 *
 * Both searches receive the same keystrokes, so the comparison is fair.
 */
@Component({
  selector: 'app-input-rate-demo',
  imports: [ReactiveFormsModule, TextInput, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="demo" *transloco="let t; prefix: 'pages.labs.performance.rate'">
      <app-text-input
        type="search"
        name="lab-search"
        data-testid="rate-search"
        [label]="t('searchLabel')"
        [hint]="t('searchHint', { count: rows().length })"
        [formControl]="query"
      />

      <table class="readout-table">
        <thead>
          <tr>
            <th scope="col">{{ t('strategy') }}</th>
            <th scope="col">{{ t('scans') }}</th>
            <th scope="col">{{ t('scanTime') }}</th>
            <th scope="col">{{ t('matches') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{{ t('immediate') }}</th>
            <td data-testid="immediate-scans">{{ immediate().scans }}</td>
            <td data-testid="immediate-ms">{{ immediate().totalMs }}</td>
            <td>{{ immediate().matches }}</td>
          </tr>
          <tr>
            <th scope="row">{{ t('debounced', { ms: debounceMs }) }}</th>
            <td data-testid="debounced-scans">{{ debounced().scans }}</td>
            <td data-testid="debounced-ms">{{ debounced().totalMs }}</td>
            <td>{{ debounced().matches }}</td>
          </tr>
        </tbody>
      </table>

      <div class="pad" data-testid="pointer-pad" (pointermove)="pointer$.next()">
        {{ t('padHint') }}
      </div>
      <dl class="readout" aria-live="off">
        <div>
          <dt>{{ t('pointerEvents') }}</dt>
          <dd data-testid="pointer-raw">{{ rawPointer() }}</dd>
        </div>
        <div>
          <dt>{{ t('pointerHandled', { ms: throttleMs }) }}</dt>
          <dd data-testid="pointer-throttled">{{ throttledPointer() }}</dd>
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

    .readout-table {
      border-collapse: collapse;
    }

    .readout-table th,
    .readout-table td {
      padding: var(--space-1) var(--space-3);
      border-block-end: var(--border-width) solid var(--border-subtle);
      text-align: start;
      font-variant-numeric: tabular-nums;
    }

    .pad {
      display: grid;
      place-items: center;
      height: 8rem;
      border: var(--border-width) dashed var(--border-strong);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      touch-action: none;
    }

    .readout {
      display: flex;
      gap: var(--space-5);
      margin: 0;
    }

    dt {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    dd {
      margin: 0;
      font-variant-numeric: tabular-nums;
      font-weight: var(--weight-semibold);
    }
  `,
})
export class InputRateDemo {
  readonly rows = input.required<readonly DatasetRow[]>();

  private readonly now = injectLabClock();

  protected readonly debounceMs = SEARCH_DEBOUNCE_MS;
  protected readonly throttleMs = POINTER_THROTTLE_MS;
  protected readonly query = new FormControl('', { nonNullable: true });
  protected readonly immediate = signal<ScanTotals>({ scans: 0, totalMs: 0, matches: 0 });
  protected readonly debounced = signal<ScanTotals>({ scans: 0, totalMs: 0, matches: 0 });

  protected readonly pointer$ = new Subject<void>();
  protected readonly rawPointer = signal(0);
  protected readonly throttledPointer = signal(0);

  constructor() {
    this.query.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => this.scan(value, this.immediate));
    this.query.valueChanges
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe((value) => this.scan(value, this.debounced));

    this.pointer$.pipe(takeUntilDestroyed()).subscribe(() => this.rawPointer.update((n) => n + 1));
    this.pointer$
      .pipe(throttleTime(POINTER_THROTTLE_MS), takeUntilDestroyed())
      .subscribe(() => this.throttledPointer.update((n) => n + 1));
  }

  private scan(query: string, into: WritableSignal<ScanTotals>): void {
    const started = this.now();
    const matches = filterRows(this.rows(), query).length;
    const elapsed = this.now() - started;
    into.update((totals) => ({
      scans: totals.scans + 1,
      totalMs: Math.round(totals.totalMs + elapsed),
      matches,
    }));
  }
}
