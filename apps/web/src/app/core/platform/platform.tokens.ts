import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT, inject, InjectionToken, PLATFORM_ID } from '@angular/core';

/**
 * Platform safety seam.
 *
 * The application is scaffolded with SSR, so `window`, `localStorage` and
 * friends do not exist while the server renders. Rather than scattering
 * `isPlatformBrowser()` checks through feature code, browser capabilities are
 * reachable only through the tokens below, and a lint rule forbids touching the
 * globals directly (see eslint.config.js).
 *
 * On the server every token resolves to an inert implementation, so calling
 * code never needs to branch.
 */

/** True only in the browser. Prefer a token below over branching on this. */
export const IS_BROWSER = new InjectionToken<boolean>('ecm.isBrowser', {
  providedIn: 'root',
  factory: () => isPlatformBrowser(inject(PLATFORM_ID)),
});

/** The browser window, or `null` on the server. */
export const WINDOW = new InjectionToken<Window | null>('ecm.window', {
  providedIn: 'root',
  factory: () => inject(DOCUMENT).defaultView,
});

/**
 * The subset of `Storage` the application is allowed to use.
 *
 * Deliberately not the DOM `Storage` interface: `key()`, `length` and `clear()`
 * invite code that walks or wipes storage owned by someone else.
 */
export interface KeyValueStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

/**
 * Storage that silently does nothing.
 *
 * Used on the server, and in a browser that refuses storage access (private
 * windows, blocked site data). Reads return `null`, which every caller must
 * already handle, so a refusal degrades instead of throwing.
 */
class UnavailableStorage implements KeyValueStorage {
  read(): string | null {
    return null;
  }
  write(): void {
    /* intentionally empty */
  }
  remove(): void {
    /* intentionally empty */
  }
}

class WebStorage implements KeyValueStorage {
  constructor(private readonly backing: Storage) {}

  read(key: string): string | null {
    try {
      return this.backing.getItem(key);
    } catch {
      return null;
    }
  }

  write(key: string, value: string): void {
    try {
      this.backing.setItem(key, value);
    } catch {
      /* quota exceeded or access denied - storage is best-effort by contract */
    }
  }

  remove(key: string): void {
    try {
      this.backing.removeItem(key);
    } catch {
      /* see write() */
    }
  }
}

function storageFrom(pick: (win: Window) => Storage): KeyValueStorage {
  const win = inject(WINDOW);
  if (!win) {
    return new UnavailableStorage();
  }
  try {
    // Touching the property can throw before we ever read a key.
    return new WebStorage(pick(win));
  } catch {
    return new UnavailableStorage();
  }
}

/** Survives a reload. Never put a secret or a token here. */
export const LOCAL_STORAGE = new InjectionToken<KeyValueStorage>('ecm.localStorage', {
  providedIn: 'root',
  factory: () => storageFrom((win) => win.localStorage),
});

/** Cleared when the tab closes. */
export const SESSION_STORAGE = new InjectionToken<KeyValueStorage>('ecm.sessionStorage', {
  providedIn: 'root',
  factory: () => storageFrom((win) => win.sessionStorage),
});
