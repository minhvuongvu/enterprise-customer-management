import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AppConfigStore } from '../core/config/app-config';
import { Logger } from '../core/logging/logger';
import type { LogFields } from '../core/logging/logger';
import { HomePage } from './home-page';
import translations from '../core/i18n/translations/en.json';

/** Captures instead of printing, so a test run stays readable. */
class CapturingLogger extends Logger {
  readonly entries: { level: string; message: string; fields?: LogFields }[] = [];

  debug(message: string, fields?: LogFields): void {
    this.entries.push({ level: 'debug', message, fields });
  }
  info(message: string, fields?: LogFields): void {
    this.entries.push({ level: 'info', message, fields });
  }
  warn(message: string, fields?: LogFields): void {
    this.entries.push({ level: 'warn', message, fields });
  }
  error(message: string, fields?: LogFields): void {
    this.entries.push({ level: 'error', message, fields });
  }
}

/**
 * Covers the page's own decision: what the user is told about the API.
 *
 * The real translations are loaded rather than stubbed, so a key that is
 * renamed in the template but not in `en.json` fails here instead of rendering
 * an empty paragraph in production.
 */
describe('HomePage', () => {
  let backend: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        HomePage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        { provide: Logger, useClass: CapturingLogger },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('asks the API where the runtime configuration says it is', () => {
    TestBed.inject(AppConfigStore).apply({ apiBaseUrl: '/some-other-base' });

    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();

    // One build, any environment: the URL is not compiled in.
    backend.expectOne('/some-other-base/health').flush({ status: 'ok', customers: 1, seed: 1 });
  });

  it('reports the customer count once the API answers', async () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();

    backend.expectOne('/api/health').flush({ status: 'ok', customers: 50_000, seed: 20260920 });
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Connected to the mock API.');
    expect(text).toContain('50000 customers in the dataset.');
  });

  it('tells the user when the API cannot be reached, without showing the raw error', async () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();

    backend
      .expectOne('/api/health')
      .flush('Internal Server Error', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('not reachable');
    // The backend's body must never reach the page.
    expect(text).not.toContain('Internal Server Error');
  });

  it('treats a 200 with the wrong shape as a failure, not as data', async () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();

    // A backend that drifts from the contract must fail at the boundary,
    // not three layers away as `undefined is not an object`.
    backend.expectOne('/api/health').flush({ status: 'ok' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent ?? '').toContain('not reachable');
  });
});
