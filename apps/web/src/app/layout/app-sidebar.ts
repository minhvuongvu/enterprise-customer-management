import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { FeatureFlags } from '../core/config/feature-flags';
import { Tooltip } from '../shared/ui/tooltip/tooltip';
import { NavIcon } from './nav-icon';
import { PRIMARY_NAV } from './nav-items';

/**
 * Primary navigation.
 *
 * It renders the links and nothing else - no positioning, no drawer, no
 * breakpoint logic. `AppShell` decides whether this appears as a permanent
 * region, a narrow rail, or the contents of a modal drawer. That split is what
 * lets the mobile drawer and the desktop sidebar be the same navigation
 * instead of two lists that disagree by Phase 4.
 *
 * `compact` is an input rather than a media query because the same component
 * renders expanded inside the mobile drawer and collapsed on a tablet - two
 * different widths wanting the same treatment is exactly the case CSS alone
 * cannot express.
 */
@Component({
  selector: 'app-sidebar',
  imports: [NavIcon, RouterLink, RouterLinkActive, Tooltip, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-compact]': "compact() ? '' : null" },
  template: `
    <nav class="sidebar" *transloco="let t" [attr.aria-label]="t('nav.primary')">
      <ul class="sidebar__list">
        @for (item of items(); track item.path) {
          <li>
            <a
              class="sidebar__link"
              [routerLink]="item.path"
              routerLinkActive="is-active"
              #link="routerLinkActive"
              [attr.aria-current]="link.isActive ? 'page' : null"
              [appTooltip]="compact() ? t(item.labelKey) : ''"
              (click)="navigated.emit()"
            >
              <app-nav-icon [name]="item.icon" />
              <!-- Hidden visually in compact mode, never removed: the link's
                   accessible name is this text, and an icon has none. -->
              <span class="sidebar__label">{{ t(item.labelKey) }}</span>
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
  styles: `
    .sidebar {
      padding: var(--space-3);
    }

    .sidebar__list {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .sidebar__link {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      font-weight: var(--weight-medium);
      text-decoration: none;
      transition: background-color var(--motion-fast) var(--motion-ease);
    }

    .sidebar__link:hover {
      background-color: var(--surface-hover);
      color: var(--text-primary);
    }

    .sidebar__link.is-active {
      background-color: var(--accent-subtle);
      color: var(--accent-text);
    }

    :host([data-compact]) .sidebar__link {
      justify-content: center;
      padding: var(--space-3);
    }

    /* The same technique as the global .visually-hidden class, applied here
       because component styles cannot reach a global class from a template
       that is conditionally compact. */
    :host([data-compact]) .sidebar__label {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class AppSidebar {
  /** Icons only, labels hidden. Used for the tablet rail. */
  readonly compact = input(false);

  /** Emitted on every link activation, so a modal drawer can close itself. */
  readonly navigated = output<void>();

  private readonly features = inject(FeatureFlags);

  /**
   * A disabled feature disappears from navigation as well as from routing.
   * A link to a route that no longer matches produces a 404, which reads as a
   * broken application rather than as an unavailable feature.
   */
  protected readonly items = computed(() =>
    PRIMARY_NAV.filter((item) => !item.feature || this.features.isEnabled(item.feature)),
  );
}
