import { Routes } from '@angular/router';
import { withMetadata } from '../core/routing/route-metadata';

/**
 * The technical-lab routes.
 *
 * `api-connectivity` is a real lab and is declared before `:labId`, for the
 * same reason `new` comes before `:id` in the customer routes: a concrete
 * segment must win over a parameter, and route order is what decides that.
 *
 * `:labId` is the placeholder every planned lab resolves to until its phase
 * arrives. One route and one component rather than six empty files - the
 * catalogue in `lab-catalog.ts` is what differs between them, and it is data.
 */
export const technicalLabsRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'pages.labs.index.title',
    loadComponent: () => import('./labs-index-page').then((m) => m.LabsIndexPage),
  },
  {
    path: 'api-connectivity',
    title: 'pages.labs.apiConnectivity.title',
    data: withMetadata({ breadcrumb: 'pages.labs.apiConnectivity.breadcrumb' }),
    loadComponent: () =>
      import('./api-connectivity/api-connectivity-lab').then((m) => m.ApiConnectivityLab),
  },
  {
    path: ':labId',
    title: 'pages.labs.placeholder.title',
    data: withMetadata({ breadcrumb: 'pages.labs.placeholder.breadcrumb' }),
    loadComponent: () => import('./lab-placeholder-page').then((m) => m.LabPlaceholderPage),
  },
];
