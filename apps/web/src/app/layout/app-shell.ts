import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { SIGN_IN_PATH } from '../core/auth/return-url';
import { SessionService } from '../core/auth/session.service';
import { RealtimeClient } from '../core/realtime/realtime-client';
import { AppHeader } from './app-header';
import { ConfirmationHost } from './confirmation-host';
import { AppSidebar } from './app-sidebar';
import { Breadcrumbs } from './breadcrumbs';
import { LayoutBreakpoints } from './layout-breakpoints';
import { OfflineBanner } from './offline-banner';
import { ToastRegion } from './toast-region';

/**
 * The authenticated application shell (ADR-0011).
 *
 * Everything inside the guarded branch of the route tree renders here, so this
 * is also the reason the tree has that shape: header, navigation and
 * breadcrumbs are built once and survive navigation, and only the outlet's
 * contents change.
 *
 * The navigation changes *kind*, not just size, across the three layouts:
 *
 *  - desktop - a permanent region beside the content;
 *  - tablet  - a narrow rail of icons, labels kept for assistive technology
 *              and shown as tooltips;
 *  - mobile  - a modal drawer, which means a focus trap, Escape, and closing
 *              on navigation.
 *
 * The first two are pure CSS. The third is why `LayoutBreakpoints` exists: a
 * modal region has behaviour, and behaviour cannot live in a media query.
 */
@Component({
  selector: 'app-shell',
  imports: [
    A11yModule,
    AppHeader,
    AppSidebar,
    Breadcrumbs,
    ConfirmationHost,
    OfflineBanner,
    RouterOutlet,
    ToastRegion,
    TranslocoDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell" *transloco="let t" [attr.data-mode]="mode()">
      <!--
        First in the tab order, visible only when focused.

        The href is real, so the link behaves like one - but activation is
        handled here, because the fragment belongs to the router's URL and a
        history entry for "moved focus" is not a place a user wants to come
        back to with the back button.
      -->
      <a class="skip-link" href="#main-content" (click)="skipToContent($event)">
        {{ t('app.skipToContent') }}
      </a>

      <app-header
        [showMenuButton]="usesDrawer()"
        [drawerOpen]="drawerOpen()"
        [userName]="session.user()?.displayName ?? ''"
        [roleKey]="roleKey()"
        [signingOut]="signingOut()"
        (menuToggled)="toggleDrawer()"
        (signOut)="signOut()"
      />

      <app-offline-banner />

      <div class="shell__body">
        @if (!usesDrawer()) {
          <div class="shell__sidebar">
            <app-sidebar [compact]="mode() === 'tablet'" />
          </div>
        }

        <!-- tabindex="-1" is what lets the skip link move focus here; without
             it the link scrolls the page and leaves focus in the header. -->
        <main #mainContent id="main-content" class="shell__main" tabindex="-1">
          <app-breadcrumbs />
          <router-outlet />
        </main>
      </div>

      <app-toast-region />
      <app-confirmation-host />

      @if (drawerOpen()) {
        <div class="drawer">
          <div
            class="drawer__panel"
            role="dialog"
            aria-modal="true"
            [attr.aria-label]="t('nav.menu')"
            cdkTrapFocus
            [cdkTrapFocusAutoCapture]="true"
            (keydown.escape)="closeDrawer()"
          >
            <app-sidebar (navigated)="closeDrawer()" />
          </div>

          <!-- See app-dialog: dismissing by clicking outside is a real button,
               placed after the panel so it is the last tab stop rather than
               the first. Its label differs from the header toggle's on
               purpose - two controls announced identically are two controls a
               screen-reader user cannot tell apart. -->
          <button
            type="button"
            class="drawer__dismiss"
            [attr.aria-label]="t('nav.dismissMenu')"
            (click)="closeDrawer()"
          ></button>
        </div>
      }
    </div>
  `,
  styles: `
    @use 'styles/breakpoints' as bp;

    .shell {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .shell__body {
      display: flex;
      flex: 1;
      align-items: stretch;
      /* Without this a wide table stretches the flex row instead of
         scrolling inside it, and the whole page scrolls sideways. */
      min-width: 0;
    }

    .shell__sidebar {
      position: sticky;
      top: var(--layout-header-height);
      flex: 0 0 var(--layout-sidebar-width);
      height: calc(100vh - var(--layout-header-height));
      overflow-y: auto;
      border-inline-end: var(--border-width) solid var(--border-subtle);
      background-color: var(--surface-raised);
    }

    /* The tablet rail: same navigation, room for the content. */
    .shell[data-mode='tablet'] .shell__sidebar {
      flex-basis: var(--layout-rail-width);
    }

    .shell__main {
      flex: 1;
      min-width: 0;
      padding: var(--space-5) var(--space-4);
    }

    .shell__main:focus {
      /* Focused only programmatically, by the skip link. A ring around the
         whole page would be noise; the heading below it is what the user
         reads next. */
      outline: none;
    }

    .drawer {
      position: fixed;
      inset: 0;
      z-index: var(--z-drawer);
      background-color: var(--scrim);
    }

    .drawer__dismiss {
      position: absolute;
      inset: 0;
      z-index: 0;
      border: none;
      background: transparent;
      cursor: default;
    }

    .drawer__panel {
      position: relative;
      z-index: 1;
      width: min(var(--layout-sidebar-width), 80vw);
      height: 100%;
      overflow-y: auto;
      background-color: var(--surface-raised);
      box-shadow: var(--shadow-lg);
    }

    @media #{bp.$below-tablet} {
      .shell__main {
        padding: var(--space-4) var(--space-3);
      }
    }
  `,
})
export class AppShell {
  private readonly breakpoints = inject(LayoutBreakpoints);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionService);

  protected readonly roleKey = computed(() => {
    const role = this.session.user()?.role;
    return role ? `auth.role.${role}` : '';
  });
  protected readonly signingOut = signal(false);

  protected readonly mode = this.breakpoints.mode;
  protected readonly usesDrawer = this.breakpoints.usesDrawerNavigation;

  /** Only meaningful in the mobile layout; see the effect below. */
  protected readonly drawerOpen = signal(false);

  private readonly mainContent = viewChild.required<ElementRef<HTMLElement>>('mainContent');

  constructor() {
    // Live updates exist exactly as long as the signed-in application does:
    // opened with the shell, closed with it - which is also what happens on
    // sign-out and on an expired session, both of which leave the shell.
    const realtime = inject(RealtimeClient);
    realtime.connect();
    inject(DestroyRef).onDestroy(() => realtime.disconnect());

    // A window widened while the drawer is open would otherwise leave a modal
    // overlay covering a layout that already has a permanent sidebar.
    effect(() => {
      if (!this.usesDrawer()) {
        this.drawerOpen.set(false);
      }
    });

    // Link clicks are handled by the sidebar's own output; this covers the
    // back button, which changes the route without anyone clicking anything.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.drawerOpen.set(false));
  }

  /**
   * Moves focus into the content.
   *
   * Scrolling is not enough: without focus, the next Tab starts again at the
   * top of the navigation the user just asked to skip.
   */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.mainContent().nativeElement.focus();
  }

  protected toggleDrawer(): void {
    this.drawerOpen.update((open) => !open);
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  /**
   * Signs out, then leaves the application for the sign-in page.
   *
   * Navigating away is also what discards the customer data on screen: the
   * feature's store and cache are provided by its route, so leaving the shell
   * destroys them. Nothing one user loaded survives into the next session in
   * the same tab.
   *
   * `replaceUrl`, so the back button does not return to a page of customer
   * data the user has just signed out of.
   */
  protected signOut(): void {
    if (this.signingOut()) {
      return;
    }
    this.signingOut.set(true);
    this.session.signOut().subscribe(() => {
      this.signingOut.set(false);
      void this.router.navigateByUrl(SIGN_IN_PATH, { replaceUrl: true });
    });
  }
}
