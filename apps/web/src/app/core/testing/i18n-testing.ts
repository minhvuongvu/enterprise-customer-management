import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../i18n/translations/en.json';
import vi from '../i18n/translations/vi.json';

/**
 * The real translations, both languages, in a test. English is active; a
 * test that wants Vietnamese calls `TranslocoService.setActiveLang('vi')`.
 *
 * Test-only. Loading the actual file rather than a stub is deliberate: a key
 * renamed in a template but not in `en.json` then fails here, as an assertion
 * about missing text, instead of rendering an empty element in production. It
 * also means a test can assert on the sentence a user would really read.
 */
export function provideTestTranslations() {
  return TranslocoTestingModule.forRoot({
    langs: { en, vi },
    translocoConfig: { availableLangs: ['en', 'vi'], defaultLang: 'en' },
    preloadLangs: true,
  });
}
