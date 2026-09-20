import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type NavIconName = 'customers' | 'labs';

/**
 * The application's icons, as path data.
 *
 * An icon font or an SVG sprite would both be defensible; a dependency on an
 * icon library for two glyphs would not. Inline SVG also inherits
 * `currentColor`, so icons follow the theme without a second set of tokens.
 *
 * Drawn on a 24x24 grid with strokes rather than fills, so one stroke width
 * keeps them visually consistent at every size.
 */
const ICON_PATHS: Readonly<Record<NavIconName, readonly string[]>> = {
  customers: [
    'M16 19v-1.5a4 4 0 0 0-4-4H6.5a4 4 0 0 0-4 4V19',
    'M9.25 9.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z',
    'M21.5 19v-1.5a4 4 0 0 0-3-3.87',
    'M15.5 3.2a4 4 0 0 1 0 7.75',
  ],
  labs: [
    'M9.5 3v5.4L4.6 17a2 2 0 0 0 1.75 3h11.3a2 2 0 0 0 1.75-3l-4.9-8.6V3',
    'M8 3h8',
    'M7.8 14h8.4',
  ],
};

/**
 * `aria-hidden` without exception: every icon in this application sits beside
 * a label, visible or visually hidden. An icon that carries meaning on its own
 * is a bug in the calling component, not something to fix with a `title` here.
 */
@Component({
  selector: 'app-nav-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @for (path of paths(); track path) {
        <path [attr.d]="path" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    svg {
      width: 1.25rem;
      height: 1.25rem;
    }
  `,
})
export class NavIcon {
  readonly name = input.required<NavIconName>();

  protected readonly paths = computed(() => ICON_PATHS[this.name()]);
}
