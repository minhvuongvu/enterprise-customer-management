import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Placeholder shapes shown while content loads.
 *
 * `aria-hidden`, and not negotiable: a screen reader announcing eight empty
 * boxes is worse than silence. The region that is loading owns the
 * announcement, through `aria-busy` or a live region - exactly as with
 * `app-spinner`.
 *
 * Skeletons are for content whose shape is known in advance; a spinner is for
 * a wait whose result has no shape yet. Using the wrong one produces a layout
 * that jumps when the data arrives.
 */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    @for (line of lineIndexes(); track line) {
      <span class="skeleton" [style.width]="line === lastIndex() ? lastLineWidth() : '100%'"></span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .skeleton {
      display: block;
      height: 0.75rem;
      border-radius: var(--radius-sm);
      background-color: var(--surface-sunken);
      /* A pulse rather than a sweeping gradient: one property animating,
         and the global reduced-motion rule already stops it. */
      animation: skeleton-pulse 1.4s ease-in-out infinite;
    }

    @keyframes skeleton-pulse {
      50% {
        opacity: 0.45;
      }
    }
  `,
})
export class Skeleton {
  readonly lines = input(1);
  /** The last line is short, because a paragraph's last line usually is. */
  readonly lastLineWidth = input('60%');

  protected lineIndexes(): number[] {
    return Array.from({ length: Math.max(1, this.lines()) }, (_, index) => index);
  }

  protected lastIndex(): number {
    return Math.max(1, this.lines()) - 1;
  }
}
