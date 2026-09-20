import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideTestHttp, SilentLogger } from '../testing/http-testing';
import { Logger } from '../logging/logger';
import { AppConfigStore, DEFAULT_APP_CONFIG } from './app-config';
import { provideRuntimeConfig } from './runtime-config.provider';

/**
 * The boot-time fetch of `/config.json`.
 *
 * Phase 0 shipped this untested and recorded it as debt row 1, because the one
 * property that matters - one build runs in any environment - is invisible
 * until a deployment gets the wrong API URL. Phase 2 is the first phase whose
 * every request depends on that URL being right, so this is where it is paid.
 *
 * `TestBed.inject` is what runs the application initializers, which is why
 * each test asks for the store before expecting the request.
 */
describe('provideRuntimeConfig', () => {
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTestHttp(), provideRuntimeConfig()],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('applies what the file says over the compiled-in defaults', async () => {
    const store = TestBed.inject(AppConfigStore);

    backend.expectOne('/config.json').flush({ apiBaseUrl: 'https://api.staging.test' });
    await Promise.resolve();

    expect(store.config().apiBaseUrl).toBe('https://api.staging.test');
    // A partial file adds to the defaults rather than blanking what it omits.
    expect(store.config().defaultLanguage).toBe(DEFAULT_APP_CONFIG.defaultLanguage);
  });

  it('merges feature flags rather than replacing the set', async () => {
    const store = TestBed.inject(AppConfigStore);

    backend.expectOne('/config.json').flush({ features: { technicalLabs: false } });
    await Promise.resolve();

    expect(store.config().features.technicalLabs).toBe(false);
  });

  it('starts on the defaults, and says so, when the file is missing', async () => {
    const store = TestBed.inject(AppConfigStore);

    backend.expectOne('/config.json').flush(null, { status: 404, statusText: 'Not Found' });
    await Promise.resolve();

    // Starting with defaults beats not starting; the warning is what makes a
    // missing file visible instead of mysterious.
    expect(store.config()).toEqual(DEFAULT_APP_CONFIG);
    const logger = TestBed.inject(Logger) as SilentLogger;
    expect(logger.entries.some((entry) => entry.level === 'warn')).toBe(true);
  });
});
