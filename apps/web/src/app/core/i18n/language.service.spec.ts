import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import {
  IS_BROWSER,
  LOCAL_STORAGE,
  WINDOW,
  type KeyValueStorage,
} from '../platform/platform.tokens';
import { provideTestTranslations } from '../testing/i18n-testing';
import { LanguageService } from './language.service';

/** An in-memory stand-in for browser storage. */
class FakeStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();

  read(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  write(key: string, value: string): void {
    this.values.set(key, value);
  }
  remove(key: string): void {
    this.values.delete(key);
  }
}

describe('LanguageService', () => {
  let storage: FakeStorage;
  let events: EventTarget;

  function configure(options: { stored?: string; browser?: boolean } = {}) {
    storage = new FakeStorage();
    if (options.stored) {
      storage.write('ecm.language', options.stored);
    }
    // Only the storage event is dispatched on it, so a bare EventTarget is
    // the whole window this service needs.
    events = new EventTarget();
    TestBed.configureTestingModule({
      imports: [provideTestTranslations()],
      providers: [
        { provide: LOCAL_STORAGE, useValue: storage },
        { provide: IS_BROWSER, useValue: options.browser ?? true },
        { provide: WINDOW, useValue: events as unknown as Window },
      ],
    });
    return TestBed.inject(LanguageService);
  }

  it('exposes the language, its locale and its direction as signals', async () => {
    const language = configure();
    expect(language.active()).toBe('en');
    expect(language.locale()).toBe('en-US');

    await language.use('vi');

    expect(language.active()).toBe('vi');
    expect(language.locale()).toBe('vi-VN');
    expect(language.direction()).toBe('ltr');
  });

  it('remembers the choice', async () => {
    const language = configure();

    await language.use('vi');

    expect(storage.read('ecm.language')).toBe('vi');
  });

  it('ignores a language it does not ship', async () => {
    const language = configure();

    await language.use('fr');

    expect(language.active()).toBe('en');
    expect(storage.read('ecm.language')).toBeNull();
  });

  it('restores the stored choice ahead of the default', async () => {
    const language = configure({ stored: 'vi' });

    await language.restore('en');

    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('vi');
  });

  it('falls back to the default when the stored value is not a language', async () => {
    const language = configure({ stored: 'klingon' });

    await language.restore('en');

    expect(language.active()).toBe('en');
  });

  it('never restores on the server, where the HTML is shared by everyone', async () => {
    const language = configure({ stored: 'vi', browser: false });

    await language.restore('en');

    expect(language.active()).toBe('en');
  });

  it('follows a choice made in another tab', async () => {
    const language = configure();

    const event = new Event('storage') as Event & { key: string; newValue: string };
    Object.assign(event, { key: 'ecm.language', newValue: 'vi' });
    events.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve));

    expect(language.active()).toBe('vi');
  });
});
