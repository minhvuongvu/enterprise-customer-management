import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Telemetry } from '../observability/telemetry';
import { IS_BROWSER, LOCAL_STORAGE, WINDOW } from '../platform/platform.tokens';
import { findLanguage, languageDefinition, SUPPORTED_LANGUAGES } from './languages';

/** Where the choice survives a reload. Not a secret; storage is best-effort. */
const STORAGE_KEY = 'ecm.language';

/**
 * The active language, and the one way to change it.
 *
 * Transloco already holds the active language; this service adds the three
 * things an application needs around it and that no component should repeat:
 *
 *  - **a signal**, so a `computed()` or an impure pipe that formats a date
 *    re-runs when the language changes. `getActiveLang()` is a snapshot, and
 *    a computed built on a snapshot silently keeps the first language;
 *  - **the locale and direction** that go with the language (`languages.ts`);
 *  - **persistence**, in `localStorage`, followed across tabs through the
 *    `storage` event exactly as the theme is (docs/cross-tab.md).
 *
 * Switching loads the new language's chunk *before* making it active. The
 * other order would re-render every translated template against a dictionary
 * that is not there yet, and flash raw keys for the length of a download.
 *
 * No page reload is involved, which is the requirement that ruled out
 * `@angular/localize` in ADR-0001.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly storage = inject(LOCAL_STORAGE);
  private readonly isBrowser = inject(IS_BROWSER);
  private readonly telemetry = inject(Telemetry);

  readonly supported = SUPPORTED_LANGUAGES;

  /** The active language code, e.g. `vi`. */
  readonly active = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  /** The locale every `Intl` formatter uses, e.g. `vi-VN`. */
  readonly locale = computed(() => languageDefinition(this.active()).locale);
  readonly direction = computed(() => languageDefinition(this.active()).direction);

  private readonly loading = signal(false);
  /** True while a language chunk is downloading; a switcher can show it. */
  readonly switching = this.loading.asReadonly();

  constructor() {
    this.followOtherTabs();
  }

  /**
   * Makes `code` the active language and remembers the choice.
   *
   * Unknown codes are ignored rather than thrown: the value comes from
   * storage or a control, and neither is worth crashing the page over.
   */
  async use(code: string): Promise<void> {
    const language = findLanguage(code);
    if (!language) {
      return;
    }
    this.storage.write(STORAGE_KEY, language.code);
    await this.activate(language.code);
    this.telemetry.track({ name: 'preferences.language_changed', language: language.code });
  }

  /**
   * Chooses the starting language: the stored choice, else the deployment's
   * default. Browser only - prerendered HTML is always in the default
   * language, because it is shared by every visitor and must not carry one
   * user's preference.
   */
  async restore(defaultLanguage: string): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const stored = findLanguage(this.storage.read(STORAGE_KEY));
    const initial = stored ?? findLanguage(defaultLanguage);
    if (initial) {
      await this.activate(initial.code);
    }
  }

  private async activate(code: string): Promise<void> {
    if (code === this.transloco.getActiveLang()) {
      return;
    }
    this.loading.set(true);
    try {
      await firstValueFrom(this.transloco.load(code));
      this.transloco.setActiveLang(code);
    } finally {
      this.loading.set(false);
    }
  }

  private followOtherTabs(): void {
    const win = inject(WINDOW);
    if (!win) {
      return;
    }
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== STORAGE_KEY) {
        return;
      }
      const language = findLanguage(event.newValue);
      if (language) {
        void this.activate(language.code);
      }
    };
    win.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => win.removeEventListener('storage', onStorage));
  }
}
