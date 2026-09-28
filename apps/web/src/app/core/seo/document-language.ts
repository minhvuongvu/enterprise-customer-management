import {
  DOCUMENT,
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { languageDefinition } from '../i18n/languages';

/**
 * Keeps `<html lang>` and `<html dir>` in sync with the active language.
 *
 * Small, and it does three separate jobs: screen readers choose a voice from
 * it, browsers choose hyphenation and quotation rules from it, and it is the
 * one piece of classic SEO metadata that still applies to an authenticated
 * back office (context 7.1).
 *
 * `dir` is the switch a right-to-left language would flip. Both shipped
 * languages are `ltr`, so it never changes today; it is written anyway so that
 * RTL support is a new entry in `languages.ts` rather than a new mechanism
 * (docs/i18n.md).
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
        document.documentElement.dir = languageDefinition(lang).direction;
      });
    }),
  ]);
}
