import { TestBed } from '@angular/core/testing';
import { AppConfigStore, appConfigOverridesSchema, DEFAULT_APP_CONFIG } from './app-config';

describe('AppConfigStore', () => {
  function store(): AppConfigStore {
    TestBed.configureTestingModule({});
    return TestBed.inject(AppConfigStore);
  }

  it('starts from a complete configuration, so a missing config.json still boots', () => {
    expect(store().config()).toEqual(DEFAULT_APP_CONFIG);
  });

  it('applies overrides over the defaults', () => {
    const subject = store();
    subject.apply({ apiBaseUrl: '/gateway/api' });

    expect(subject.config().apiBaseUrl).toBe('/gateway/api');
    expect(subject.config().defaultLanguage).toBe(DEFAULT_APP_CONFIG.defaultLanguage);
  });

  it('merges feature flags rather than replacing the whole map', () => {
    const subject = store();
    // A config.json that mentions no flags must not silently disable them all.
    subject.apply({ apiBaseUrl: '/other' });

    expect(subject.config().features).toEqual(DEFAULT_APP_CONFIG.features);
  });

  it('lets a deployment turn a flag off', () => {
    const subject = store();
    subject.apply({ features: { technicalLabs: false } });

    expect(subject.config().features.technicalLabs).toBe(false);
  });
});

describe('appConfigOverridesSchema', () => {
  /**
   * The API must be same-origin: the session cookies are first-party only
   * through the reverse proxy, and the CSRF interceptor stamps only relative
   * URLs. An absolute URL used to validate - and then every write was refused
   * with 403, with nothing pointing at the configuration (Phase 8 review).
   */
  it.each(['/api', '/gateway/api'])('accepts the same-origin path %s', (apiBaseUrl) => {
    expect(appConfigOverridesSchema.safeParse({ apiBaseUrl }).success).toBe(true);
  });

  it.each(['https://api.example.test', '//api.example.test', 'api', '/api/', '/'])(
    'rejects %s, which the session and CSRF layers cannot work with',
    (apiBaseUrl) => {
      const parsed = appConfigOverridesSchema.safeParse({ apiBaseUrl });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.path).toEqual(['apiBaseUrl']);
    },
  );
});
