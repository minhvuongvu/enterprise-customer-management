import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, TitleStrategy } from '@angular/router';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { provideLocationMocks } from '@angular/common/testing';
import { TranslatedTitleStrategy } from './translated-title.strategy';
import translations from '../i18n/translations/en.json';

@Component({
  selector: 'app-title-probe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class TitleProbe {}

describe('TranslatedTitleStrategy', () => {
  async function navigateTo(url: string) {
    await TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { en: translations, xx: { app: { title: 'Kundenverwaltung' } } },
          translocoConfig: { availableLangs: ['en', 'xx'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([
          { path: 'customers', title: 'pages.customers.list.title', component: TitleProbe },
          { path: 'untitled', component: TitleProbe },
        ]),
        provideLocationMocks(),
        { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
      ],
    }).compileComponents();

    await TestBed.inject(Router).navigateByUrl(url);
    // The strategy reacts to a signal, so the title is written on the next
    // flush rather than inside `navigateByUrl`.
    TestBed.tick();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('translates the route title instead of writing the key into the tab', async () => {
    await navigateTo('/customers');

    // The failure this prevents is visible and embarrassing: a browser tab
    // reading "pages.customers.list.title".
    expect(document.title).toBe('Customers · Customer Management');
  });

  it('falls back to the application name for a route without a title', async () => {
    await navigateTo('/untitled');

    expect(document.title).toBe('Customer Management');
  });

  it('re-translates when the language changes', async () => {
    await navigateTo('/untitled');
    expect(document.title).toBe('Customer Management');

    TestBed.inject(TranslocoService).setActiveLang('xx');
    TestBed.tick();

    // A title set once at navigation would still be in English here, which is
    // exactly the bug Phase 6 would otherwise have to find.
    expect(document.title).toBe('Kundenverwaltung');
  });
});
