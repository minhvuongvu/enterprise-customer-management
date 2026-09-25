import { RenderMode, ServerRoute } from '@angular/ssr';
import {
  RENDERING_SPECIMENS,
  SPECIMEN_BASE_PATH,
  type RenderingSpecimen,
} from './technical-labs/rendering/rendering-specimens';

/**
 * The rendering lab's specimens: the same page, each in a different mode, so
 * Phase 5 can measure the modes against each other (ADR-0026). Public and
 * data-free, so none of them needs a session on the server.
 */
function specimenRoute(specimen: RenderingSpecimen): ServerRoute {
  const path = `${SPECIMEN_BASE_PATH}/${specimen.id}`;
  switch (specimen.source) {
    case 'client':
      return { path, renderMode: RenderMode.Client };
    case 'server':
      return { path, renderMode: RenderMode.Server };
    case 'build':
      return { path, renderMode: RenderMode.Prerender };
  }
}

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
  ...RENDERING_SPECIMENS.map(specimenRoute),
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
