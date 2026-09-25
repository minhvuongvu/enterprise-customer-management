import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
  withIncrementalHydration,
} from '@angular/platform-browser';
import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
  withInMemoryScrolling,
  withPreloading,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { provideCore } from './core/core.providers';
import { FlaggedPreloading } from './core/routing/flagged-preloading';
import { TranslatedTitleStrategy } from './core/seo/translated-title.strategy';

/**
 * Browser bootstrap configuration.
 *
 * Kept deliberately thin: infrastructure is assembled in `provideCore()` so
 * that this file stays a readable list of what the application is, rather than
 * a pile of providers nobody dares to reorder.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // Route parameters arrive as component inputs. Phase 2 reads `:id` and
      // the list's query parameters this way instead of subscribing to
      // ActivatedRoute in every component.
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
      // Only routes marked `preload` are fetched ahead of time. Phase 5,
      // measured in docs/performance.md.
      withPreloading(FlaggedPreloading),
    ),
    // Route titles are translation keys, so the default strategy - which
    // writes them into the document verbatim - would put `pages.customers.
    // list.title` in the browser tab. See ADR-0009.
    { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
    // Event replay captures clicks that land before hydration finishes on the
    // prerendered public routes, so an early click is not silently lost.
    // Incremental hydration lets a `@defer (hydrate ...)` block stay inert
    // server HTML until its trigger fires; only the rendering lab's specimen
    // uses one (ADR-0026), and without such a block it changes nothing.
    provideClientHydration(withEventReplay(), withIncrementalHydration()),
    provideCore(),
    // Caches the application shell - its JavaScript, styles and index - so the
    // application starts without a network. Never API data (ngsw-config.json,
    // ADR-0028). Production builds only: in development every rebuild would
    // be a new version to install. Registered once the application is
    // stable, so installing it never competes with the first render.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
