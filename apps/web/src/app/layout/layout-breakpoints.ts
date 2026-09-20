import { BreakpointObserver } from '@angular/cdk/layout';
import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { IS_BROWSER } from '../core/platform/platform.tokens';

/**
 * The same two numbers as `src/styles/_breakpoints.scss`.
 *
 * Duplicated deliberately rather than generated: a build step that turns SCSS
 * into TypeScript would be more machinery than two constants are worth, and a
 * test in `layout-breakpoints.spec.ts` fails if the two files drift.
 */
export const TABLET_UP = '(min-width: 48rem)';
export const DESKTOP_UP = '(min-width: 64rem)';

/**
 * Which of the three layouts is in effect.
 *
 * Named by layout, not by device: a desktop window dragged to a third of the
 * screen gets the tablet layout, which is correct and is what "responsive"
 * means. Nothing in the application asks "is this a phone".
 */
export type LayoutMode = 'mobile' | 'tablet' | 'desktop';

/**
 * Makes the active layout available to TypeScript.
 *
 * Most responsive behaviour is CSS and should stay CSS - it works before
 * hydration, it works with JavaScript disabled, and it costs no change
 * detection. This service exists for the part CSS cannot do: the mobile
 * navigation is a modal drawer, and "modal" means trapping focus and closing
 * on Escape, which are decisions code has to make.
 *
 * On the server every media query is false, so `mode` reports `desktop` there
 * rather than `mobile`. The authenticated shell is client-rendered (ADR-0003),
 * so this only affects what the very first frame assumes.
 */
@Injectable({ providedIn: 'root' })
export class LayoutBreakpoints {
  private readonly isBrowser = inject(IS_BROWSER);

  private readonly state = toSignal(inject(BreakpointObserver).observe([TABLET_UP, DESKTOP_UP]), {
    initialValue: null,
  });

  readonly mode = computed<LayoutMode>(() => {
    const state = this.state();
    if (!this.isBrowser || state === null) {
      return 'desktop';
    }
    if (state.breakpoints[DESKTOP_UP]) {
      return 'desktop';
    }
    return state.breakpoints[TABLET_UP] ? 'tablet' : 'mobile';
  });

  /** True when navigation is a modal drawer rather than a permanent region. */
  readonly usesDrawerNavigation = computed(() => this.mode() === 'mobile');
}
