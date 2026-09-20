import { TestBed } from '@angular/core/testing';
import { LOCAL_STORAGE, WINDOW } from './platform.tokens';

describe('storage tokens', () => {
  it('degrades to a no-op when there is no window, as during server rendering', () => {
    TestBed.configureTestingModule({ providers: [{ provide: WINDOW, useValue: null }] });

    const storage = TestBed.inject(LOCAL_STORAGE);

    expect(storage.read('anything')).toBeNull();
    // Writing must not throw: callers should not need to know where they run.
    expect(() => storage.write('a', 'b')).not.toThrow();
    expect(() => storage.remove('a')).not.toThrow();
  });

  it('degrades when the browser refuses storage access', () => {
    // A private window or blocked site data throws on property access itself,
    // before any key is read.
    const hostileWindow = {
      get localStorage(): Storage {
        throw new Error('SecurityError: the operation is insecure.');
      },
    } as unknown as Window;

    TestBed.configureTestingModule({ providers: [{ provide: WINDOW, useValue: hostileWindow }] });

    const storage = TestBed.inject(LOCAL_STORAGE);

    expect(storage.read('anything')).toBeNull();
    expect(() => storage.write('a', 'b')).not.toThrow();
  });

  it('reads and writes through when storage works', () => {
    const backing = new Map<string, string>();
    const fakeWindow = {
      localStorage: {
        getItem: (key: string) => backing.get(key) ?? null,
        setItem: (key: string, value: string) => void backing.set(key, value),
        removeItem: (key: string) => void backing.delete(key),
      },
    } as unknown as Window;

    TestBed.configureTestingModule({ providers: [{ provide: WINDOW, useValue: fakeWindow }] });

    const storage = TestBed.inject(LOCAL_STORAGE);
    storage.write('language', 'en');
    expect(storage.read('language')).toBe('en');

    storage.remove('language');
    expect(storage.read('language')).toBeNull();
  });
});
