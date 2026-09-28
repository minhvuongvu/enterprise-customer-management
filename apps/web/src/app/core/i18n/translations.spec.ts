import { availableLanguages } from './bundled-translation.loader';
import { SUPPORTED_LANGUAGES } from './languages';
import en from './translations/en.json';
import vi from './translations/vi.json';

/**
 * The translation files agree with each other.
 *
 * A key present in English and missing in Vietnamese renders the raw key -
 * `pages.customers.list.heading` - to a Vietnamese user, and nothing but a
 * reader who knows both languages would notice. So the files are compared
 * structurally, here, on every test run:
 *
 *  - the same keys, in both directions;
 *  - the same interpolation parameters for each key, because a translation
 *    that drops `{{name}}` silently loses the customer's name;
 *  - plural entries are plural in both, carry `other`, and use only the CLDR
 *    categories that language actually has (`one` in Vietnamese would be dead
 *    text: `Intl.PluralRules('vi')` never selects it).
 */

interface Tree {
  readonly [key: string]: string | Tree;
}

const PLURAL_CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

/**
 * A plural entry is an object of CLDR categories that includes `other`. The
 * `other` requirement is what tells `crossTab.customers.many` - an ordinary
 * key that happens to be called "many" - apart from a plural.
 */
function isPlural(value: Tree): boolean {
  const keys = Object.keys(value);
  return keys.includes('other') && keys.every((key) => PLURAL_CATEGORIES.has(key));
}

/** Leaf keys, with plural entries kept whole. */
function flatten(tree: Tree, prefix = ''): Map<string, string | Tree> {
  const result = new Map<string, string | Tree>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string' || isPlural(value)) {
      result.set(path, value);
    } else {
      for (const [nested, leaf] of flatten(value, path)) {
        result.set(nested, leaf);
      }
    }
  }
  return result;
}

function parameters(value: string | Tree): readonly string[] {
  const text = typeof value === 'string' ? value : Object.values(value).join(' ');
  const names = [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]);
  return [...new Set(names)].sort();
}

const files: Readonly<Record<string, Map<string, string | Tree>>> = {
  en: flatten(en as Tree),
  vi: flatten(vi as Tree),
};

describe('translations', () => {
  it('ships a file for every supported language, and no other', () => {
    expect([...availableLanguages()].sort()).toEqual(
      SUPPORTED_LANGUAGES.map((language) => language.code).sort(),
    );
  });

  it('has the same keys in every language', () => {
    const english = [...files['en'].keys()].sort();
    for (const [lang, entries] of Object.entries(files)) {
      expect({ lang, keys: [...entries.keys()].sort() }).toEqual({ lang, keys: english });
    }
  });

  it('uses the same interpolation parameters for each key', () => {
    const mismatches: string[] = [];
    for (const [key, value] of files['en']) {
      const expected = parameters(value).join(',');
      const actual = parameters(files['vi'].get(key) ?? '').join(',');
      if (expected !== actual) {
        mismatches.push(`${key}: en {${expected}} vi {${actual}}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('keeps plural entries plural, and uses only categories the language has', () => {
    const problems: string[] = [];
    for (const language of SUPPORTED_LANGUAGES) {
      const categories = new Set<string>(
        new Intl.PluralRules(language.locale).resolvedOptions().pluralCategories,
      );
      for (const [key, value] of files[language.code]) {
        const englishIsPlural = typeof files['en'].get(key) !== 'string';
        const isPluralHere = typeof value !== 'string';
        if (englishIsPlural !== isPluralHere) {
          problems.push(`${language.code} ${key}: plural in one language only`);
          continue;
        }
        if (typeof value === 'string') {
          continue;
        }
        for (const category of Object.keys(value)) {
          if (!categories.has(category)) {
            problems.push(`${language.code} ${key}: "${category}" is never selected`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('leaves no value empty', () => {
    const empty = Object.entries(files).flatMap(([lang, entries]) =>
      [...entries]
        .filter(([, value]) =>
          typeof value === 'string'
            ? value.trim() === ''
            : Object.values(value).some((text) => String(text).trim() === ''),
        )
        .map(([key]) => `${lang} ${key}`),
    );
    expect(empty).toEqual([]);
  });
});
