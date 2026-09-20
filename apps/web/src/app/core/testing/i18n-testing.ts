import { TranslocoTestingModule } from '@jsverse/transloco';
import translations from '../i18n/translations/en.json';

/**
 * The real English translations, in a test.
 *
 * Test-only. Loading the actual file rather than a stub is deliberate: a key
 * renamed in a template but not in `en.json` then fails here, as an assertion
 * about missing text, instead of rendering an empty element in production. It
 * also means a test can assert on the sentence a user would really read.
 */
export function provideTestTranslations() {
  return TranslocoTestingModule.forRoot({
    langs: { en: translations },
    translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
    preloadLangs: true,
  });
}
