import { ScrollingModule } from '@angular/cdk/scrolling';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { Button } from '../../shared/ui/button/button';
import { injectLabClock } from './lab-clock';
import type { DatasetRow } from './performance-dataset';

type ListMode = 'plain' | 'virtual';

/** The largest list rendered without virtualisation. Past this the tab stalls for seconds. */
export const PLAIN_LIST_LIMIT = 10_000;
const ROW_HEIGHT_PX = 32;

/**
 * Renders the dataset as a plain `@for` or through CDK virtual scrolling, and
 * reports what each costs: time to render, and how many elements the page
 * then holds.
 *
 * The measurement is the point. "Virtual scrolling is faster" is true only
 * past some size, and below it the plain list is simpler, searchable with
 * Ctrl+F, and printable; the numbers say where the line is.
 *
 * Timing: from the click to the first render after it (`afterNextRender`) -
 * the moment the rows are in the DOM. It includes Angular's work and the
 * browser's style and layout for the rows, not the paint.
 */
@Component({
  selector: 'app-virtual-scroll-demo',
  imports: [Button, ScrollingModule, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="demo" *transloco="let t; prefix: 'pages.labs.performance.virtual'">
      <div class="demo__controls">
        <app-button data-testid="render-plain-1000" (click)="render('plain', 1_000)">
          {{ t('plain', { count: 1000 }) }}
        </app-button>
        <app-button data-testid="render-plain-10000" (click)="render('plain', plainLimit)">
          {{ t('plain', { count: plainLimit }) }}
        </app-button>
        <app-button data-testid="render-virtual" (click)="render('virtual', rows().length)">
          {{ t('virtual', { count: rows().length }) }}
        </app-button>
      </div>

      <dl class="readout" aria-live="polite">
        <div>
          <dt>{{ t('renderTime') }}</dt>
          <dd data-testid="virtual-render-ms">{{ renderMs() ?? '-' }}</dd>
        </div>
        <div>
          <dt>{{ t('domElements') }}</dt>
          <dd data-testid="virtual-dom-elements">{{ domElements() ?? '-' }}</dd>
        </div>
      </dl>

      @switch (mode()) {
        @case ('plain') {
          <ol class="list list--plain" data-testid="plain-list">
            @for (row of rows().slice(0, count()); track row.id) {
              <li class="list__row">{{ row.code }} {{ row.name }}</li>
            }
          </ol>
        }
        @case ('virtual') {
          <cdk-virtual-scroll-viewport
            class="list"
            data-testid="virtual-list"
            [itemSize]="rowHeight"
          >
            <div *cdkVirtualFor="let row of rows(); trackBy: trackById" class="list__row">
              {{ row.code }} {{ row.name }}
            </div>
          </cdk-virtual-scroll-viewport>
        }
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

    .list {
      height: 20rem;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-md);
      list-style: none;
    }

    .list__row {
      height: 32px;
      padding-inline: var(--space-2);
      line-height: 32px;
      white-space: nowrap;
    }
  `,
})
export class VirtualScrollDemo {
  readonly rows = input.required<readonly DatasetRow[]>();

  private readonly now = injectLabClock();
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly plainLimit = PLAIN_LIST_LIMIT;
  protected readonly rowHeight = ROW_HEIGHT_PX;
  protected readonly mode = signal<ListMode | null>(null);
  protected readonly count = signal(0);
  protected readonly renderMs = signal<number | null>(null);
  protected readonly domElements = signal<number | null>(null);

  protected readonly trackById = (_: number, row: DatasetRow): number => row.id;

  protected render(mode: ListMode, count: number): void {
    const started = this.now();
    this.mode.set(mode);
    this.count.set(count);
    afterNextRender(
      {
        read: () => {
          // Reading a layout property forces the browser to compute style and
          // layout for the new rows now, so the time includes them.
          this.host.nativeElement.getBoundingClientRect();
          this.renderMs.set(Math.round(this.now() - started));
          this.domElements.set(this.host.nativeElement.querySelectorAll('*').length);
        },
      },
      { injector: this.injector },
    );
  }
}
