import { Routes } from '@angular/router';
import { withMetadata } from '../core/routing/route-metadata';
import { provideOfflineSnapshots } from './offline/offline-snapshot.store';

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
    path: 'rendering',
    title: 'pages.labs.rendering.title',
    data: withMetadata({ breadcrumb: 'pages.labs.rendering.breadcrumb' }),
    loadComponent: () => import('./rendering/rendering-lab').then((m) => m.RenderingLab),
  },
  {
    path: 'performance',
    title: 'pages.labs.performance.title',
    data: withMetadata({ breadcrumb: 'pages.labs.performance.breadcrumb' }),
    loadComponent: () => import('./performance/performance-lab').then((m) => m.PerformanceLab),
  },
  {
    path: 'browser-storage',
    title: 'pages.labs.browserStorage.title',
    data: withMetadata({ breadcrumb: 'pages.labs.browserStorage.breadcrumb' }),
    loadComponent: () =>
      import('./browser-storage/browser-storage-lab').then((m) => m.BrowserStorageLab),
  },
  {
    path: 'browser-apis',
    title: 'pages.labs.browserApis.title',
    data: withMetadata({ breadcrumb: 'pages.labs.browserApis.breadcrumb' }),
    loadComponent: () => import('./browser-apis/browser-apis-lab').then((m) => m.BrowserApisLab),
  },
  {
    path: 'workers',
    title: 'pages.labs.workers.title',
    data: withMetadata({ breadcrumb: 'pages.labs.workers.breadcrumb' }),
    loadComponent: () => import('./workers/workers-lab').then((m) => m.WorkersLab),
  },
  {
    path: 'offline',
    title: 'pages.labs.offline.title',
    data: withMetadata({ breadcrumb: 'pages.labs.offline.breadcrumb' }),
    // The snapshot store and its sign-out cleanup outlive the page: see
    // provideOfflineSnapshots.
    providers: [provideOfflineSnapshots()],
    loadComponent: () => import('./offline/offline-lab').then((m) => m.OfflineLab),
  },
  {
    path: 'cross-tab',
    title: 'pages.labs.crossTab.title',
    data: withMetadata({ breadcrumb: 'pages.labs.crossTab.breadcrumb' }),
    loadComponent: () => import('./cross-tab/cross-tab-lab').then((m) => m.CrossTabLab),
  },
  {
    path: 'leader-election',
    title: 'pages.labs.leaderElection.title',
    data: withMetadata({ breadcrumb: 'pages.labs.leaderElection.breadcrumb' }),
    loadComponent: () =>
      import('./leader-election/leader-election-lab').then((m) => m.LeaderElectionLab),
  },
  {
    path: ':labId',
    title: 'pages.labs.placeholder.title',
    data: withMetadata({ breadcrumb: 'pages.labs.placeholder.breadcrumb' }),
    loadComponent: () => import('./lab-placeholder-page').then((m) => m.LabPlaceholderPage),
  },
];
