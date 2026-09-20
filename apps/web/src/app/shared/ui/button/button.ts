import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Spinner } from '../spinner/spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

/**
 * The application's button - and, when given a `link`, its link that looks
 * like one.
 *
 * It wraps a real `<button>` or a real `<a>` rather than styling a `<div>`, so
 * keyboard activation, form submission, the disabled state, "open in new tab"
 * and the accessibility role all come from the platform instead of being
 * re-implemented - and re-broken - here.
 *
 * **An action is a button; a navigation is a link.** Rendering a destination
 * the *caller* supplies does not make this component a navigator: it still
 * decides nothing, and `[link]` is an input like any other. What it must never
 * grow is a route of its own. See the rule in `shared/ui/README.md`.
 *
 * Two further decisions worth knowing about:
 *
 *  - `loading` disables the button and marks it `aria-busy`. A button that
 *    still looks pressable while a request is in flight gets pressed again.
 *  - `disabled` uses the native attribute, which removes the button from the
 *    tab order. That is the right default; a form whose submit button must
 *    explain *why* it is unavailable should stay enabled and fail loudly
 *    instead.
 *
 * It has no idea what it does. A caller that wants an icon-only button
 * projects an icon plus a `.visually-hidden` label - the label belongs to the
 * caller's translation namespace, not to a generic component.
 */
@Component({
  selector: 'app-button',
  imports: [NgTemplateOutlet, RouterLink, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-full]': "fullWidth() ? '' : null" },
  template: `
    <!-- Projected content is declared once and rendered into whichever
         element is used. Two ng-content slots would silently send the
         caller's content to only one of them. -->
    <ng-template #content>
      @if (loading()) {
        <app-spinner [size]="size() === 'sm' ? 'sm' : 'md'" />
      }
      <span class="btn__label"><ng-content /></span>
    </ng-template>

    @if (link(); as target) {
      <a
        class="btn"
        [routerLink]="target"
        [attr.data-variant]="variant()"
        [attr.data-size]="size()"
      >
        <ng-container [ngTemplateOutlet]="content" />
      </a>
    } @else {
      <button
        class="btn"
        [attr.type]="type()"
        [attr.data-variant]="variant()"
        [attr.data-size]="size()"
        [disabled]="isDisabled()"
        [attr.aria-busy]="loading() ? 'true' : null"
      >
        <ng-container [ngTemplateOutlet]="content" />
      </button>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    :host([data-full]) {
      display: flex;
    }
    :host([data-full]) .btn {
      width: 100%;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-4);
      border: var(--border-width) solid transparent;
      border-radius: var(--radius-md);
      background-color: transparent;
      color: var(--text-primary);
      font-size: var(--text-md);
      font-weight: var(--weight-medium);
      line-height: var(--leading-tight);
      white-space: nowrap;
      text-decoration: none;
      cursor: pointer;
      transition:
        background-color var(--motion-fast) var(--motion-ease),
        border-color var(--motion-fast) var(--motion-ease);
    }

    .btn[data-size='sm'] {
      padding: var(--space-1) var(--space-3);
      font-size: var(--text-sm);
    }

    .btn:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .btn[data-variant='primary'] {
      background-color: var(--accent);
      color: var(--text-on-accent);
    }
    .btn[data-variant='primary']:hover:not(:disabled) {
      background-color: var(--accent-hover);
    }

    .btn[data-variant='secondary'] {
      border-color: var(--border-strong);
      background-color: var(--surface-raised);
    }
    .btn[data-variant='secondary']:hover:not(:disabled) {
      background-color: var(--surface-hover);
    }

    .btn[data-variant='ghost']:hover:not(:disabled) {
      background-color: var(--surface-hover);
    }

    .btn[data-variant='danger'] {
      background-color: var(--danger);
      color: var(--text-on-accent);
    }
    .btn[data-variant='danger']:hover:not(:disabled) {
      filter: brightness(0.92);
    }

    /* The label collapses to nothing for an icon-only button, and the gap
       would still reserve space for it. */
    .btn__label:empty {
      display: none;
    }
  `,
})
export class Button {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly disabled = input(false);
  readonly loading = input(false);
  /**
   * Stretches to the container. Used by the mobile layouts, where a row of
   * side-by-side buttons does not fit.
   */
  readonly fullWidth = input(false);
  /**
   * A router destination. When set, an `<a>` is rendered instead of a
   * `<button>` - so the browser offers "open in a new tab" and middle click,
   * which a click handler cannot.
   */
  readonly link = input<string | unknown[] | null>(null);

  protected readonly isDisabled = computed(() => this.disabled() || this.loading());
}
