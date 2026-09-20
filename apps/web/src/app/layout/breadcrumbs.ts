import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { filter, map } from 'rxjs';
import { routeMetadata } from '../core/routing/route-metadata';

/** One step of the trail. `labelKey` is a translation key, never a label. */
export interface Breadcrumb {
  readonly labelKey: string;
  readonly url: string;
}

/**
 * Where the user is, derived from the route tree.
 *
 * Built from route metadata rather than from a service that pages push into.
 * A page that announces its own crumb gets it wrong on the one path nobody
 * tested - deep-linking straight to `/customers/:id/edit`, where the
 * intermediate pages never ran. Reading the activated route tree cannot have
 * that bug, because the tree is the same however the user arrived.
 *
 * A single crumb is not rendered: it would only repeat the page heading
 * directly beneath it.
 *
 * Phase 2 will want `/customers/:id` to read "Ada Lovelace" rather than
 * "Customer". That is a resolver on the route, feeding a dynamic label - the
 * shape here does not have to change for it.
 */
@Component({
  selector: 'app-breadcrumbs',
  imports: [RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <nav class="breadcrumbs" *transloco="let t" [attr.aria-label]="t('nav.breadcrumbs')">
        <ol class="breadcrumbs__list">
          @for (crumb of crumbs(); track crumb.url; let last = $last) {
            <li class="breadcrumbs__item">
              @if (last) {
                <!-- The current page is not a link to itself. -->
                <span aria-current="page">{{ t(crumb.labelKey) }}</span>
              } @else {
                <a [routerLink]="crumb.url">{{ t(crumb.labelKey) }}</a>
              }
            </li>
          }
        </ol>
      </nav>
    }
  `,
  styles: `
    .breadcrumbs__list {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: var(--text-sm);
    }

    .breadcrumbs__item {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--text-muted);
    }

    /* Decorative separator, drawn rather than written: a "/" in the markup
       would be read out by a screen reader as part of the trail. */
    .breadcrumbs__item + .breadcrumbs__item::before {
      content: '\\203A';
      color: var(--text-muted);
    }

    .breadcrumbs__item a {
      color: var(--text-secondary);
      text-decoration: none;
    }

    .breadcrumbs__item a:hover {
      text-decoration: underline;
    }
  `,
})
export class Breadcrumbs {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly crumbs = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.build()),
    ),
    // Deep links and reloads land with navigation already finished, so the
    // first trail has to be built eagerly rather than waiting for an event.
    { initialValue: this.build() },
  );

  protected readonly visible = computed(() => this.crumbs().length > 1);

  private build(): readonly Breadcrumb[] {
    const crumbs: Breadcrumb[] = [];
    let route: ActivatedRoute | null = this.route.root;
    let url = '';

    while (route) {
      const segments = route.snapshot.url.map((segment) => segment.path);
      if (segments.length > 0) {
        url += `/${segments.join('/')}`;
      }

      const { breadcrumb } = routeMetadata(route.snapshot);
      if (breadcrumb) {
        crumbs.push({ labelKey: breadcrumb, url });
      }

      route = route.firstChild;
    }

    return crumbs;
  }
}
