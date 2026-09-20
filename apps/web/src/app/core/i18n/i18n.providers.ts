import { EnvironmentProviders, isDevMode, makeEnvironmentProviders } from '@angular/core';
import { provideTransloco } from '@jsverse/transloco';
import { availableLanguages, BundledTranslationLoader } from './bundled-translation.loader';
import { DEFAULT_APP_CONFIG } from '../config/app-config';

/**
 * Translation seam.
 *
 * Only English exists today. It is wired up in Phase 0 anyway, because the
 * expensive part of i18n is not the second language - it is extracting strings
 * that were hardcoded across six phases. A lint rule keeps that from happening.
 */
export function provideI18n(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideTransloco({
      config: {
        availableLangs: [...availableLanguages()],
        defaultLang: DEFAULT_APP_CONFIG.defaultLanguage,
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: {
          // In development a missing key should be loud. In production it
          // should not render an empty element where text belongs.
          logMissingKey: isDevMode(),
          useFallbackTranslation: false,
          allowEmpty: false,
        },
      },
      loader: BundledTranslationLoader,
    }),
  ]);
}
