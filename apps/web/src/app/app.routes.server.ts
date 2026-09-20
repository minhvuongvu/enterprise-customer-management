import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * How each route is produced on the server.
 *
 * The decision behind this file is in ANGULAR_PROJECT_CONTEXT.md 5.6: SSR is
 * configured from Phase 0 so it never has to be retrofitted, but the
 * authenticated application is still rendered in the browser.
 *
 * Prerendering a page whose content depends on who is asking would be wrong,
 * and server-rendering it buys nothing here: a back office has no crawler to
 * satisfy (7.1). What SSR does buy from day one is enforcement - a stray
 * `window` reference fails the server build immediately.
 */
export const serverRoutes: ServerRoute[] = [
  {
    // Public surface: static, identical for everyone, so it is prerendered.
    path: 'login',
    renderMode: RenderMode.Prerender,
  },
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
