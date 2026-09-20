import {
  DOCUMENT,
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

/**
 * Keeps `<html lang>` in sync with the active language.
 *
 * Small, and it does three separate jobs: screen readers choose a voice from
 * it, browsers choose hyphenation and quotation rules from it, and it is the
 * one piece of classic SEO metadata that still applies to an authenticated
 * back office (context 7.1).
 *
 * `index.html` ships `lang="en"`, so this only matters once Phase 6 adds a
 * second language - which is precisely why it is wired now rather than
 * remembered then.
 */
export function provideDocumentLanguage(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      const document = inject(DOCUMENT);
      const transloco = inject(TranslocoService);

      // Also fires for the initial language, so there is no separate first
      // assignment to keep in step with this one.
      transloco.langChanges$.subscribe((lang) => {
        document.documentElement.lang = lang;
      });
    }),
  ]);
}
