import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

/**
 * Routing foundation.
 *
 * Phase 1 builds the real route tree (customers, technical labs, nested routes,
 * breadcrumbs). What Phase 0 fixes is the shape those routes plug into:
 *
 *  - every route is lazily loaded, so adding a feature never grows the initial
 *    bundle by default;
 *  - the public/authenticated split exists already and is mirrored by the
 *    server render modes in app.routes.server.ts;
 *  - `authGuard` is attached to the protected branch now, so Phase 3 changes a
 *    function body rather than the route tree.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'home',
  },
  {
    // Public: reachable without a session, and prerendered.
    path: 'login',
    loadComponent: () => import('./login/login-page').then((m) => m.LoginPage),
  },
  {
    // Authenticated: Phase 1 turns this into the application shell with
    // children, which is why the guard is on the branch and not on a leaf.
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () => import('./home/home-page').then((m) => m.HomePage),
  },
  {
    path: '**',
    loadComponent: () => import('./not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
