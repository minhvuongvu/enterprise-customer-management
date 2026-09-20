import { Routes } from '@angular/router';
import { withMetadata } from '../core/routing/route-metadata';

/**
 * The customer feature's routes.
 *
 * A feature owns its own route file and the application composes it with one
 * `loadChildren`. Adding `/customers/:id/notes` in a later phase is then a
 * change to this file alone - `app.routes.ts` never learns about it.
 *
 * `titles` are translation keys, resolved by `TranslatedTitleStrategy`
 * (ADR-0009). `breadcrumb` metadata is typed through `withMetadata`, and is
 * read from each route's own configuration rather than from the merged
 * snapshot - see `route-metadata.ts` for why that distinction matters.
 *
 * Everything here is a placeholder. Phase 2 fills the pages in; the routes,
 * their parameters and their metadata are what Phase 1 is fixing in place.
 */
export const customersRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'pages.customers.list.title',
    loadComponent: () =>
      import('./customer-list/customer-list-page').then((m) => m.CustomerListPage),
  },
  {
    // Before `:id`, or "new" would be read as an identifier. Route order is
    // load-bearing and this is the classic way to get it wrong.
    path: 'new',
    title: 'pages.customers.create.title',
    data: {
      ...withMetadata({ breadcrumb: 'pages.customers.create.breadcrumb' }),
      // Bound straight to the page's `mode` input by `withComponentInputBinding`.
      // One component serves create and edit because the difference between
      // them is which data it starts from, not what it looks like.
      mode: 'create',
    },
    loadComponent: () =>
      import('./customer-form/customer-form-page').then((m) => m.CustomerFormPage),
  },
  {
    path: ':id',
    data: withMetadata({ breadcrumb: 'pages.customers.detail.breadcrumb' }),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'pages.customers.detail.title',
        loadComponent: () =>
          import('./customer-detail/customer-detail-page').then((m) => m.CustomerDetailPage),
      },
      {
        path: 'edit',
        title: 'pages.customers.edit.title',
        data: {
          ...withMetadata({ breadcrumb: 'pages.customers.edit.breadcrumb' }),
          mode: 'edit',
        },
        loadComponent: () =>
          import('./customer-form/customer-form-page').then((m) => m.CustomerFormPage),
      },
      {
        path: 'audit',
        title: 'pages.customers.audit.title',
        data: withMetadata({ breadcrumb: 'pages.customers.audit.breadcrumb' }),
        loadComponent: () =>
          import('./customer-audit/customer-audit-page').then((m) => m.CustomerAuditPage),
      },
    ],
  },
];
