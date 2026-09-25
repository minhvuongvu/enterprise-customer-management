import type { Routes } from '@angular/router';
import { RENDERING_SPECIMENS } from './rendering-specimens';

/**
 * One route per specimen, all rendering the same page. The render mode of
 * each is declared in `app.routes.server.ts`; the `specimen` data is how the
 * page knows which one it is.
 */
export const renderingSpecimenRoutes: Routes = RENDERING_SPECIMENS.map((specimen) => ({
  path: specimen.id,
  title: 'pages.labs.rendering.specimen.title',
  data: { specimen: specimen.id },
  loadComponent: () => import('./rendering-specimen-page').then((m) => m.RenderingSpecimenPage),
}));
