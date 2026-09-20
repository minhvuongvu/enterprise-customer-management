import { provideLocationMocks } from '@angular/common/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { routes } from '../app.routes';
import { Breadcrumbs } from './breadcrumbs';
import translations from '../core/i18n/translations/en.json';

/**
 * No `<router-outlet>`: the trail is derived from the router's state, not from
 * anything the pages render, so leaving them out proves exactly that - and
 * keeps the shell, its breakpoints and its translations out of the test.
 */
@Component({
  selector: 'app-breadcrumbs-host',
  imports: [Breadcrumbs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-breadcrumbs />`,
})
class BreadcrumbsHost {}

describe('Breadcrumbs', () => {
  async function renderAt(url: string) {
    await TestBed.configureTestingModule({
      imports: [
        BreadcrumbsHost,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideRouter(routes), provideLocationMocks()],
    }).compileComponents();

    const fixture = TestBed.createComponent(BreadcrumbsHost);
    fixture.detectChanges();

    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    return fixture;
  }

  function trail(fixture: { nativeElement: unknown }) {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.breadcrumbs__item'),
    ).map((item) => item.textContent?.trim());
  }

  afterEach(() => TestBed.resetTestingModule());

  it('builds the trail from the real route tree', async () => {
    const fixture = await renderAt('/customers/c-42/edit');

    expect(trail(fixture)).toEqual(['Customers', 'Customer', 'Edit']);
  });

  it('links every step except the one the user is on', async () => {
    const fixture = await renderAt('/customers/c-42/edit');
    const root = fixture.nativeElement as HTMLElement;

    const links = Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/customers', '/customers/c-42']);

    // The current page is text with aria-current, not a link to itself.
    expect(root.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Edit');
  });

  it('is a labelled landmark so it can be skipped', async () => {
    const fixture = await renderAt('/customers/c-42/audit');

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('nav')?.getAttribute('aria-label'),
    ).toBe('Breadcrumb');
  });

  it('renders nothing when there is only one step', async () => {
    const fixture = await renderAt('/customers');

    // A one-item trail repeats the page heading immediately below it.
    expect((fixture.nativeElement as HTMLElement).querySelector('nav')).toBeNull();
  });

  it('does not repeat a parent crumb on its own index child', async () => {
    const fixture = await renderAt('/customers/c-42');

    // Angular merges a parent's `data` into an empty-path child, so reading
    // `snapshot.data` here would produce "Customers > Customer > Customer".
    expect(trail(fixture)).toEqual(['Customers', 'Customer']);
  });
});
