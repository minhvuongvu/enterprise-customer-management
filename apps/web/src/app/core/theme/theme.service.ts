import { BreakpointObserver } from '@angular/cdk/layout';
import { computed, DestroyRef, DOCUMENT, effect, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { IS_BROWSER, LOCAL_STORAGE, WINDOW } from '../platform/platform.tokens';

/**
 * What the user asked for. `system` is a real choice, not the absence of one:
 * it means "follow the operating system", and it keeps following it when the
 * operating system changes at sunset.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

/** What is actually painted, once `system` has been resolved. */
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

/** Where the choice survives a reload. Not a secret; storage is best-effort. */
const STORAGE_KEY = 'ecm.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Runtime theme switching (ADR-0010).
 *
 * The whole mechanism is one attribute on `<html>`, because every component is
 * written against semantic tokens rather than colours. Nothing re-renders; the
 * browser recomputes custom properties and repaints.
 *
 * The deliberate detail: for `system` the attribute is *removed* rather than
 * set to a resolved value. That hands the decision back to the
 * `prefers-color-scheme` media query in the stylesheet, which is also what
 * paints the server-rendered HTML before any of this code has run.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storage = inject(LOCAL_STORAGE);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = inject(IS_BROWSER);

  private readonly current = signal<ThemePreference>('system');

  /**
   * CDK's `BreakpointObserver` rather than `window.matchMedia`: it already
   * copes with a server that has no media queries and with browsers whose
   * `MediaQueryList` predates `addEventListener`, so this class needs no
   * platform branch of its own.
   */
  private readonly systemPrefersDark = toSignal(
    inject(BreakpointObserver)
      .observe(DARK_QUERY)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  /** The stored choice, including `system`. */
  readonly preference = this.current.asReadonly();

  /** The theme actually in effect. Use this to label UI, not `preference`. */
  readonly resolved = computed<ResolvedTheme>(() => {
    const preference = this.current();
    if (preference !== 'system') {
      return preference;
    }
    return this.systemPrefersDark() ? 'dark' : 'light';
  });

  constructor() {
    this.current.set(this.readStoredPreference());
    effect(() => this.applyPreference(this.current()));
    this.followOtherTabs();
  }

  set(preference: ThemePreference): void {
    this.current.set(preference);

    if (preference === 'system') {
      this.storage.remove(STORAGE_KEY);
    } else {
      this.storage.write(STORAGE_KEY, preference);
    }
  }

  /**
   * Writes the attribute the stylesheet keys off.
   *
   * Skipped entirely on the server: prerendered HTML must not carry one
   * user's theme, and leaving the attribute off is what lets the media query
   * produce a correct first paint for everyone.
   */
  private applyPreference(preference: ThemePreference): void {
    if (!this.isBrowser) {
      return;
    }

    const root = this.document.documentElement;
    if (preference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', preference);
    }
  }

  /**
   * A theme chosen in another tab applies here too (docs/cross-tab.md).
   *
   * The `storage` event is the one cross-tab mechanism that needs no code in
   * the sending tab: the browser fires it in every *other* tab of the origin
   * whenever `localStorage` changes. That makes it right for exactly this
   * kind of state - a preference that already lives in storage - and wrong
   * for messages, which would have to be written into storage only to be
   * noticed (that is what `TabChannel` is for).
   *
   * `key === null` is `localStorage.clear()`: the preference is gone, so the
   * stored value - `system` - is read back like any other change.
   */
  private followOtherTabs(): void {
    const win = inject(WINDOW);
    if (!win) {
      return;
    }
    const onStorage = (event: StorageEvent): void => {
      if (event.key === STORAGE_KEY || event.key === null) {
        this.current.set(this.readStoredPreference());
      }
    };
    win.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => win.removeEventListener('storage', onStorage));
  }

  private readStoredPreference(): ThemePreference {
    const stored = this.storage.read(STORAGE_KEY);
    // An unrecognised value means storage was written by an older build or by
    // something else entirely; falling back to `system` is always safe.
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  }
}
