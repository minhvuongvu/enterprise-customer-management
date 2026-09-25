import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { LOCAL_STORAGE, WINDOW, type KeyValueStorage } from '../platform/platform.tokens';
import { ThemeService } from './theme.service';

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

/** Reports whatever the test says the operating system currently prefers. */
class FakeBreakpointObserver {
  readonly state: BehaviorSubject<BreakpointState>;

  constructor(prefersDark: boolean) {
    this.state = new BehaviorSubject<BreakpointState>({ matches: prefersDark, breakpoints: {} });
  }

  observe() {
    return this.state.asObservable();
  }

  setPrefersDark(matches: boolean): void {
    this.state.next({ matches, breakpoints: {} });
  }
}

describe('ThemeService', () => {
  let storage: FakeStorage;
  let system: FakeBreakpointObserver;

  function configure(stored?: string, prefersDark = false) {
    storage = new FakeStorage();
    if (stored !== undefined) {
      storage.write('ecm.theme', stored);
    }
    system = new FakeBreakpointObserver(prefersDark);

    TestBed.configureTestingModule({
      providers: [
        { provide: LOCAL_STORAGE, useValue: storage },
        { provide: BreakpointObserver, useValue: system },
      ],
    });

    return TestBed.inject(ThemeService);
  }

  function themeAttribute(): string | null {
    return TestBed.inject(DOCUMENT).documentElement.getAttribute('data-theme');
  }

  afterEach(() => {
    TestBed.inject(DOCUMENT).documentElement.removeAttribute('data-theme');
    TestBed.resetTestingModule();
  });

  it('follows the system until the user says otherwise', () => {
    const theme = configure(undefined, true);
    TestBed.tick();

    expect(theme.preference()).toBe('system');
    expect(theme.resolved()).toBe('dark');
    // The attribute is *absent*, which is what hands the decision to the
    // prefers-color-scheme rule in the stylesheet - the same rule that paints
    // the server-rendered HTML before any of this has run.
    expect(themeAttribute()).toBeNull();
  });

  it('keeps following the system when it changes', () => {
    const theme = configure(undefined, false);
    TestBed.tick();
    expect(theme.resolved()).toBe('light');

    system.setPrefersDark(true);
    TestBed.tick();

    expect(theme.resolved()).toBe('dark');
  });

  it('applies an explicit choice as an attribute on the document', () => {
    const theme = configure();
    theme.set('dark');
    TestBed.tick();

    expect(themeAttribute()).toBe('dark');
    expect(theme.resolved()).toBe('dark');
  });

  it('lets an explicit light choice win on a machine set to dark', () => {
    const theme = configure(undefined, true);
    theme.set('light');
    TestBed.tick();

    expect(themeAttribute()).toBe('light');
    expect(theme.resolved()).toBe('light');
  });

  it('remembers an explicit choice and forgets it again', () => {
    const theme = configure();

    theme.set('dark');
    expect(storage.read('ecm.theme')).toBe('dark');

    theme.set('system');
    // Not the string "system": absence is what "no preference stored" means,
    // so a later change of default is picked up rather than overridden.
    expect(storage.read('ecm.theme')).toBeNull();
  });

  it('restores a stored choice on the next visit', () => {
    const theme = configure('dark', false);
    TestBed.tick();

    expect(theme.preference()).toBe('dark');
    expect(themeAttribute()).toBe('dark');
  });

  it('falls back to following the system when storage holds nonsense', () => {
    const theme = configure('solarized');

    // Written by an older build, or by something else on the same origin.
    expect(theme.preference()).toBe('system');
  });
});

describe('ThemeService across tabs', () => {
  it('applies a theme another tab stored, and forgets it when another tab clears it', () => {
    const storage = new FakeStorage();
    const backing = storage.values;
    TestBed.configureTestingModule({ providers: [{ provide: LOCAL_STORAGE, useValue: storage }] });
    const theme = TestBed.inject(ThemeService);
    const win = TestBed.inject(WINDOW) as Window;

    // Another tab wrote; this tab's storage now holds it, and the browser says so.
    backing.set('ecm.theme', 'dark');
    win.dispatchEvent(new StorageEvent('storage', { key: 'ecm.theme', newValue: 'dark' }));
    expect(theme.preference()).toBe('dark');

    backing.clear();
    win.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(theme.preference()).toBe('system');
  });

  it('ignores changes to keys that are not its own', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: LOCAL_STORAGE, useValue: new FakeStorage() }],
    });
    const theme = TestBed.inject(ThemeService);
    const win = TestBed.inject(WINDOW) as Window;

    win.dispatchEvent(new StorageEvent('storage', { key: 'something.else', newValue: 'dark' }));
    expect(theme.preference()).toBe('system');
  });
});
