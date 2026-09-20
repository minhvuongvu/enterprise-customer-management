import { Injectable } from '@angular/core';
import type { Translation, TranslocoLoader } from '@jsverse/transloco';

/**
 * Loads a language as a lazily-imported chunk rather than over HTTP.
 *
 * Transloco's default loader fetches JSON at runtime, which means the server
 * renderer has to make an HTTP request to the application's own static files
 * while prerendering. A dynamic `import()` works identically in the browser and
 * in Node, keeps the language out of the initial bundle, and still switches at
 * runtime - which is the requirement `@angular/localize` could not meet.
 *
 * Adding a language in Phase 6 is one file plus one entry here.
 */
const TRANSLATION_CHUNKS: Readonly<Record<string, () => Promise<{ default: Translation }>>> = {
  en: () => import('./translations/en.json'),
};

export function availableLanguages(): readonly string[] {
  return Object.keys(TRANSLATION_CHUNKS);
}

@Injectable({ providedIn: 'root' })
export class BundledTranslationLoader implements TranslocoLoader {
  async getTranslation(lang: string): Promise<Translation> {
    const load = TRANSLATION_CHUNKS[lang];
    if (!load) {
      // A developer error, not a user-facing one: the language list and the
      // chunk map have drifted apart.
      throw new Error(`No translation chunk registered for language "${lang}".`);
    }
    return (await load()).default;
  }
}
