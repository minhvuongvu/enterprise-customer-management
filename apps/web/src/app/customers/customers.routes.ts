import { Routes } from '@angular/router';
import { requirePermission } from '../core/auth/permission.guard';
import { withMetadata } from '../core/routing/route-metadata';
import { unsavedChangesGuard } from './customer-form/unsaved-changes.guard';
import { CustomerCache } from './state/customer-cache';
import { provideCustomerRealtimeSync } from './state/customer-realtime-sync';
import { CustomerStore } from './state/customer-store';

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
 * ## The path-less parent
 *
 * Phase 2 wrapped the four pages in a route that matches nothing and exists
 * only to carry `providers`. That is what gives the feature's state its
 * lifetime: one `CustomerStore` and one `CustomerCache` serve every page under
 * `/customers`, and both are destroyed when the user leaves the section.
 *
 * The alternatives are both worse. `providedIn: 'root'` would keep one user's
 * browsing - and their cached records - alive for the life of the tab,
 * including across a sign-out. Providing the store on each page would give the
 * list a fresh, empty cache every time the user came back from a detail page,
 * which is precisely the case the cache exists for.
 *
 * No path, no component and no data, so it is invisible to the URL and to the
 * breadcrumb trail, which reads each route's own configuration.
 */
export const customersRoutes: Routes = [
  {
    path: '',
    // The realtime sync lives and dies with the store it keeps fresh.
    providers: [CustomerCache, CustomerStore, provideCustomerRealtimeSync()],
    // Route authorization. Reading is the floor for the whole section; the two
    // pages that exist only to write ask for the permission to write. Each
    // guard names a permission, never a role. UX only - the API checks the
    // same permission on every request (ADR-0018).
    canActivate: [requirePermission('CUSTOMER_READ')],
    children: [
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
        canActivate: [requirePermission('CUSTOMER_CREATE')],
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () =>
          import('./customer-form/customer-form-page').then((m) => m.CustomerFormPage),
      },
      {
        // Before `:id` for the same reason as `new`.
        path: 'import',
        title: 'pages.customers.import.title',
        data: withMetadata({ breadcrumb: 'pages.customers.import.breadcrumb' }),
        canActivate: [requirePermission('CUSTOMER_IMPORT')],
        loadComponent: () =>
          import('./customer-import/customer-import-page').then((m) => m.CustomerImportPage),
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
            canActivate: [requirePermission('CUSTOMER_UPDATE')],
            canDeactivate: [unsavedChangesGuard],
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
    ],
  },
];
