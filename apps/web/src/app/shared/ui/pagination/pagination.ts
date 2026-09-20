import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/** A rendered slot: either a page number, or the gap between two ranges. */
type PageSlot = number | 'gap';

/** Beyond this many pages the list is windowed rather than listed in full. */
const MAX_LISTED_PAGES = 7;

/**
 * Page navigation.
 *
 * Pages are 1-based here and in the URL, because they are read by people:
 * `?page=2` is the second page. The API uses the same convention, so nothing
 * in between has to add or subtract one - the kind of off-by-one that survives
 * for years because each layer assumes the other adjusted.
 *
 * It is a `<nav>` containing a list of links-as-buttons, not a row of divs: a
 * screen reader can then jump to it as a landmark, and `aria-current="page"`
 * tells the user which page they are on without relying on the colour of a
 * highlighted number.
 *
 * It owns no data. `page` in, `pageChange` out - the caller decides whether
 * that means a URL change (Phase 2 puts list state in the query string) or
 * something else.
 */
@Component({
  selector: 'app-pagination',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="pagination" *transloco="let t" [attr.aria-label]="t('ui.pagination.label')">
      <p class="pagination__summary">
        {{ t('ui.pagination.summary', { page: page(), totalPages: totalPages() }) }}
      </p>

      <ul class="pagination__list">
        <li>
          <button
            type="button"
            class="pagination__button"
            [disabled]="page() <= 1"
            [attr.aria-label]="t('ui.pagination.previous')"
            (click)="goTo(page() - 1)"
          >
            <span class="pagination__chevron" data-direction="previous" aria-hidden="true"></span>
          </button>
        </li>

        @for (slot of slots(); track $index) {
          <li>
            @if (slot === 'gap') {
              <span class="pagination__gap" aria-hidden="true"></span>
            } @else {
              <button
                type="button"
                class="pagination__button"
                [attr.aria-label]="t('ui.pagination.goToPage', { page: slot })"
                [attr.aria-current]="slot === page() ? 'page' : null"
                (click)="goTo(slot)"
              >
                {{ slot }}
              </button>
            }
          </li>
        }

        <li>
          <button
            type="button"
            class="pagination__button"
            [disabled]="page() >= totalPages()"
            [attr.aria-label]="t('ui.pagination.next')"
            (click)="goTo(page() + 1)"
          >
            <span class="pagination__chevron" data-direction="next" aria-hidden="true"></span>
          </button>
        </li>
      </ul>
    </nav>
  `,
  styles: `
    .pagination {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .pagination__summary {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .pagination__list {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .pagination__button {
      min-width: 2.25rem;
      padding: var(--space-1) var(--space-2);
      border: var(--border-width) solid transparent;
      border-radius: var(--radius-md);
      background-color: transparent;
      color: var(--text-primary);
      font-size: var(--text-md);
      cursor: pointer;
    }

    .pagination__button:hover:not(:disabled) {
      background-color: var(--surface-hover);
    }

    .pagination__button:disabled {
      color: var(--text-muted);
      cursor: not-allowed;
    }

    .pagination__button[aria-current='page'] {
      border-color: var(--accent);
      background-color: var(--accent-subtle);
      color: var(--accent-text);
      font-weight: var(--weight-semibold);
    }

    /* Decorative glyphs rendered from CSS rather than as text nodes: they are
       not content, and text in a template would be a hardcoded string. */
    .pagination__chevron[data-direction='previous']::before {
      content: '\\2039';
    }
    .pagination__chevron[data-direction='next']::before {
      content: '\\203A';
    }
    .pagination__gap::before {
      content: '\\2026';
      padding: 0 var(--space-1);
      color: var(--text-muted);
    }
  `,
})
export class Pagination {
  /** 1-based. */
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();

  readonly pageChange = output<number>();

  /**
   * Which page numbers to render.
   *
   * Windowed above `MAX_LISTED_PAGES`: first, last, the current page and its
   * neighbours. A 2500-page dataset - which the mock API actually produces -
   * would otherwise render 2500 buttons.
   */
  protected readonly slots = computed<readonly PageSlot[]>(() => {
    const total = Math.max(1, this.totalPages());
    const current = this.clamp(this.page());

    if (total <= MAX_LISTED_PAGES) {
      return Array.from({ length: total }, (_, index) => index + 1);
    }

    const first = 1;
    const last = total;
    const windowStart = Math.max(first + 1, current - 1);
    const windowEnd = Math.min(last - 1, current + 1);

    const slots: PageSlot[] = [first];
    if (windowStart > first + 1) {
      slots.push('gap');
    }
    for (let page = windowStart; page <= windowEnd; page++) {
      slots.push(page);
    }
    if (windowEnd < last - 1) {
      slots.push('gap');
    }
    slots.push(last);
    return slots;
  });

  protected goTo(page: number): void {
    const target = this.clamp(page);
    // A click on the current page is not a navigation. Emitting it anyway
    // would make the caller re-fetch, which is how a paginator ends up
    // looking slow.
    if (target !== this.page()) {
      this.pageChange.emit(target);
    }
  }

  private clamp(page: number): number {
    return Math.min(Math.max(1, page), Math.max(1, this.totalPages()));
  }
}
