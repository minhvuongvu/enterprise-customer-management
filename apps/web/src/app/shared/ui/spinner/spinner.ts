import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A busy indicator.
 *
 * Deliberately silent to assistive technology: `aria-hidden`, no `role`, no
 * text. A spinner almost never appears alone - it sits inside a button, a card
 * or a page region - and the element that owns the wait is the one that should
 * announce it, through `aria-busy` or a live region. Two announcements for one
 * wait is worse than none.
 *
 * The rotation is a CSS animation, so `prefers-reduced-motion` in the global
 * stylesheet already stops it without this component knowing.
 */
@Component({
  selector: 'app-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="spinner" aria-hidden="true"></span>`,
  host: { '[attr.data-size]': 'size()' },
  styles: `
    :host {
      display: inline-flex;
    }

    .spinner {
      display: block;
      width: var(--spinner-size);
      height: var(--spinner-size);
      border: 2px solid currentcolor;
      border-right-color: transparent;
      border-radius: var(--radius-pill);
      opacity: 0.75;
      animation: spin 700ms linear infinite;
    }

    :host {
      --spinner-size: 1rem;
    }
    :host([data-size='sm']) {
      --spinner-size: 0.75rem;
    }
    :host([data-size='lg']) {
      --spinner-size: 1.5rem;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class Spinner {
  readonly size = input<'sm' | 'md' | 'lg'>('md');
}
