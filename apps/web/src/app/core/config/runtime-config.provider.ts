import { HttpClient } from '@angular/common/http';
import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AppConfigStore } from './app-config';
import type { AppConfigOverrides } from './app-config';
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

      try {
        const overrides = await firstValueFrom(http.get<AppConfigOverrides>(RUNTIME_CONFIG_URL));
        store.apply(overrides);
      } catch {
        // Starting with defaults beats not starting. The warning is what makes
        // a missing or malformed file visible instead of mysterious.
        logger.warn('Runtime configuration unavailable; using defaults', {
          url: RUNTIME_CONFIG_URL,
        });
      }
    }),
  ]);
}
