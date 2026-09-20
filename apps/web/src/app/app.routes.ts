import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { withMetadata } from './core/routing/route-metadata';
import { technicalLabsEnabled } from './technical-labs/technical-labs.guard';

/**
 * The application's route tree.
 *
 * Its shape carries three decisions:
 *
 *  1. **Public and authenticated are different branches.** `/login` sits
 *     outside the shell and is the one route that is prerendered
 *     (`app.routes.server.ts`). Everything else lives under a path-less route
 *     that renders `AppShell` and carries `authGuard`, so the guard is stated
 *     once for the whole application rather than repeated on every page - and
 *     Phase 3 changes a function body, not this file.
 *
 *  2. **Every route is lazy.** Adding a feature never grows the initial
 *     bundle by default, and a feature owns its own route file: the
 *     application composes it with one `loadChildren` and learns nothing
 *     about its internals.
 *
 *  3. **Not found renders inside the shell.** A 404 with no navigation is a
 *     dead end; this one keeps the header and sidebar, so the user can leave.
 *
 * Route order matters twice here - `login` before the shell, and the wildcard
 * last among the shell's children.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'customers',
  },
  {
    // Public: reachable without a session, and prerendered.
    path: 'login',
    title: 'pages.login.title',
    loadComponent: () => import('./login/login-page').then((m) => m.LoginPage),
  },
  {
    // Phase 0's landing route. Kept as a redirect rather than deleted: a URL
    // that once worked and now 404s is indistinguishable from a broken
    // application, and redirects are the cheapest thing in a router.
    path: 'home',
    redirectTo: 'customers',
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/app-shell').then((m) => m.AppShell),
    children: [
      {
        path: 'customers',
        data: withMetadata({ breadcrumb: 'nav.customers' }),
        loadChildren: () => import('./customers/customers.routes').then((m) => m.customersRoutes),
      },
      {
        path: 'technical-labs',
        // A disabled flag makes the branch stop matching, so the request falls
        // through to the wildcard below and the chunk is never loaded.
        canMatch: [technicalLabsEnabled],
        data: withMetadata({ breadcrumb: 'nav.technicalLabs' }),
        loadChildren: () =>
          import('./technical-labs/technical-labs.routes').then((m) => m.technicalLabsRoutes),
      },
      {
        path: '**',
        title: 'pages.notFound.title',
        loadComponent: () => import('./not-found/not-found-page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
