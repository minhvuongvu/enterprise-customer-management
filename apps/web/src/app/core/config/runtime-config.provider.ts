import { HttpClient } from '@angular/common/http';
import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AppConfigStore, appConfigOverridesSchema } from './app-config';
import { LanguageService } from '../i18n/language.service';
import { Logger } from '../logging/logger';
import { IS_BROWSER } from '../platform/platform.tokens';

/** Served from `public/`, so it can be replaced per deployment without a build. */
const RUNTIME_CONFIG_URL = '/config.json';

/**
 * Loads runtime configuration before the application renders.
 *
 * Browser only. During server rendering the compiled-in defaults are used:
 * fetching the app's own static file from inside the renderer would be a
 * request to ourselves, and the prerendered output is a shell that the browser
 * re-configures on hydration anyway. The boundary is deliberate, not an
 * oversight - see docs/architecture.md.
 */
export function provideRuntimeConfig(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(async () => {
      if (!inject(IS_BROWSER)) {
        return;
      }

      const http = inject(HttpClient);
      const store = inject(AppConfigStore);
      const logger = inject(Logger);
      const language = inject(LanguageService);

      let raw: unknown;
      try {
        raw = await firstValueFrom(http.get<unknown>(RUNTIME_CONFIG_URL));
      } catch {
        // Starting with defaults beats not starting. The warning is what makes
        // a missing file visible instead of mysterious.
        logger.warn('Runtime configuration unavailable; using defaults', {
          url: RUNTIME_CONFIG_URL,
        });
      }

      if (raw !== undefined) {
        const parsed = appConfigOverridesSchema.safeParse(raw);
        if (parsed.success) {
          store.apply(parsed.data);
        } else {
          // All or nothing: half a configuration - the API URL applied, the
          // flags not - is a state nobody tested. The defaults are one.
          logger.error('Runtime configuration invalid; using defaults', {
            url: RUNTIME_CONFIG_URL,
            issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
          });
        }
      }

      // The starting language depends on the configuration (its default), so
      // it is chosen here, after the configuration is known, rather than in an
      // initializer of its own: initializers start together, and a separate
      // one would read the defaults before this one had replaced them. Awaited,
      // so the first render is already in the user's language.
      await language.restore(store.config().defaultLanguage);
    }),
  ]);
}
