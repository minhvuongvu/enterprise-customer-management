import { TestBed } from '@angular/core/testing';
import { AppConfigStore, DEFAULT_APP_CONFIG } from './app-config';

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
    subject.apply({ apiBaseUrl: 'https://api.example.test' });

    expect(subject.config().apiBaseUrl).toBe('https://api.example.test');
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
