import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { routes } from './app.routes';
import { provideCore } from './core/core.providers';
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
    ),
    // Route titles are translation keys, so the default strategy - which
    // writes them into the document verbatim - would put `pages.customers.
    // list.title` in the browser tab. See ADR-0009.
    { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
    // Event replay captures clicks that land before hydration finishes on the
    // prerendered public routes, so an early click is not silently lost.
    provideClientHydration(withEventReplay()),
    provideCore(),
  ],
};
