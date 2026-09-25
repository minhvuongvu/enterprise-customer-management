import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { Badge } from '../shared/ui/badge/badge';
import { Button } from '../shared/ui/button/button';
import { ConnectionStatus } from './connection-status';
import { NotificationCenter } from './notification-center';
import { ThemeToggle } from './theme-toggle';

/**
 * The application banner.
 *
 * Presentation only: it reports that the menu button - or sign out - was
 * pressed and lets `AppShell` decide what that means. A header that opened the drawer itself
 * would have to know about breakpoints, focus trapping and route changes -
 * three concerns that have nothing to do with a bar at the top of the page.
 */
@Component({
  selector: 'app-header',
  imports: [
    Badge,
    Button,
    ConnectionStatus,
    NotificationCenter,
    RouterLink,
    ThemeToggle,
    TranslocoDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="header" *transloco="let t">
      @if (showMenuButton()) {
        <button
          type="button"
          class="header__menu"
          [attr.aria-label]="t('nav.menu')"
          [attr.aria-expanded]="drawerOpen()"
          (click)="menuToggled.emit()"
        >
          <!--
            The name stays the same whether the drawer is open or closed;
            aria-expanded is what carries the state. A button that renames
            itself to "Close..." says the same thing twice, and the two can
            disagree.

            No aria-controls either: the drawer only exists in the DOM while it
            is open, and pointing at an absent id is worse than pointing at
            nothing.
          -->
          <span class="header__menu-icon" aria-hidden="true"></span>
        </button>
      }

      <a class="header__brand" routerLink="/">{{ t('app.title') }}</a>

      <div class="header__actions">
        @if (userName()) {
          <app-connection-status />
          <app-notification-center />
        }
        <app-theme-toggle />

        @if (userName()) {
          <!-- Who is signed in, and as what. The role is shown because it
               explains the UI: a manager who sees no delete button should be
               able to tell why without asking. -->
          <p class="header__user" data-testid="current-user">
            <span class="header__user-name">{{ userName() }}</span>
            @if (roleKey()) {
              <app-badge>{{ t(roleKey()) }}</app-badge>
            }
          </p>

          <app-button
            size="sm"
            variant="ghost"
            [loading]="signingOut()"
            (click)="signOut.emit()"
            data-testid="sign-out"
          >
            {{ t('auth.signOut') }}
          </app-button>
        }
      </div>
    </header>
  `,
  styles: `
    @use 'styles/breakpoints' as bp;

    /* Sticky so navigation and the theme control stay reachable while a long
       customer list scrolls. */
    :host {
      position: sticky;
      top: 0;
      z-index: var(--z-sticky);
    }

    .header {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      height: var(--layout-header-height);
      padding: 0 var(--space-4);
      border-bottom: var(--border-width) solid var(--border-subtle);
      background-color: var(--surface-raised);
    }

    .header__menu {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border: none;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--text-primary);
      cursor: pointer;
    }

    .header__menu:hover {
      background-color: var(--surface-hover);
    }

    /* Three bars from one element: the middle is the box, the other two are
       shadows. No icon asset, no second dependency. */
    .header__menu-icon {
      display: block;
      width: 1.125rem;
      height: 2px;
      background-color: currentcolor;
      box-shadow:
        0 -6px currentcolor,
        0 6px currentcolor;
    }

    .header__brand {
      color: var(--text-primary);
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .header__actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-inline-start: auto;
    }

    .header__user {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    /* On a phone the header has room for the controls, not for a name. The
       badge stays: it is the part that explains what the user can do. */
    @media #{bp.$below-tablet} {
      .header__user-name {
        display: none;
      }
    }
  `,
})
export class AppHeader {
  readonly showMenuButton = input(false);
  readonly drawerOpen = input(false);

  /** Empty when nobody is signed in, which hides the user area entirely. */
  readonly userName = input('');
  /** Translation key for the role, e.g. `auth.role.MANAGER`. */
  readonly roleKey = input('');
  readonly signingOut = input(false);

  readonly menuToggled = output<void>();
  /** The header reports the intent; the shell owns what signing out means. */
  readonly signOut = output<void>();
}
