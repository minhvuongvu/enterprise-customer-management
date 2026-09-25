import { provideLocationMocks } from '@angular/common/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { SessionService } from '../core/auth/session.service';
import { provideSignedInAs } from '../core/testing/session-testing';
import { AppShell } from './app-shell';
import { LayoutBreakpoints, type LayoutMode } from './layout-breakpoints';
import translations from '../core/i18n/translations/en.json';
import { Logger } from '../core/logging/logger';
import { SilentLogger } from '../core/testing/http-testing';

/** Lets each test say which of the three layouts it is exercising. */
class FakeLayoutBreakpoints {
  readonly current = signal<LayoutMode>('desktop');
  readonly mode = this.current.asReadonly();
  readonly usesDrawerNavigation = () => this.current() === 'mobile';
}

describe('AppShell', () => {
  let layout: FakeLayoutBreakpoints;

  async function render(mode: LayoutMode, extraProviders: unknown[] = []) {
    layout = new FakeLayoutBreakpoints();
    layout.current.set(mode);

    await TestBed.configureTestingModule({
      imports: [
        AppShell,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([
          { path: 'customers', children: [] },
          { path: 'login', children: [] },
        ]),
        provideLocationMocks(),
        { provide: LayoutBreakpoints, useValue: layout },
        // The shell opens the realtime stream, which logs. jsdom has no
        // EventSource, so the factory answers null and nothing connects.
        { provide: Logger, useClass: SilentLogger },
        ...(extraProviders as []),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppShell);
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();
    return fixture;
  }

  function root(fixture: { nativeElement: unknown }): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('gives the page exactly one main landmark, and a way to skip to it', async () => {
    const fixture = await render('desktop');

    const mains = root(fixture).querySelectorAll('main');
    expect(mains).toHaveLength(1);
    expect(mains[0].id).toBe('main-content');
    // Focusable only programmatically, so the skip link can actually move
    // focus rather than only scrolling.
    expect(mains[0].getAttribute('tabindex')).toBe('-1');

    const skip = root(fixture).querySelector('a.skip-link');
    expect(skip?.getAttribute('href')).toBe('#main-content');
    expect(skip?.textContent?.trim()).toBe('Skip to main content');
  });

  it('shows navigation permanently on a desktop, with no menu button', async () => {
    const fixture = await render('desktop');

    expect(root(fixture).querySelector('.shell__sidebar')).not.toBeNull();
    expect(root(fixture).querySelector('.header__menu')).toBeNull();
  });

  it('keeps the same navigation as a rail on a tablet', async () => {
    const fixture = await render('tablet');

    const sidebar = root(fixture).querySelector('app-sidebar');
    expect(sidebar).not.toBeNull();
    // Compact, but the labels are still in the DOM - an icon has no
    // accessible name of its own.
    expect(sidebar?.hasAttribute('data-compact')).toBe(true);
    expect(sidebar?.textContent).toContain('Customers');
  });

  it('replaces the sidebar with a modal drawer on a phone', async () => {
    const fixture = await render('mobile');

    // Not a shrunken desktop: the navigation is not on the page at all until
    // it is asked for.
    expect(root(fixture).querySelector('.shell__sidebar')).toBeNull();

    const menu = root(fixture).querySelector<HTMLButtonElement>('.header__menu');
    expect(menu?.getAttribute('aria-expanded')).toBe('false');
    // The name does not change when it opens - aria-expanded carries that.
    expect(menu?.getAttribute('aria-label')).toBe('Navigation menu');

    menu?.click();
    fixture.detectChanges();

    const drawer = root(fixture).querySelector('.drawer__panel');
    expect(drawer?.getAttribute('role')).toBe('dialog');
    expect(drawer?.getAttribute('aria-modal')).toBe('true');
    expect(menu?.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes the drawer on Escape', async () => {
    const fixture = await render('mobile');
    root(fixture).querySelector<HTMLButtonElement>('.header__menu')?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    root(fixture)
      .querySelector('.drawer__panel')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(root(fixture).querySelector('.drawer__panel')).toBeNull();
  });

  it('closes the drawer when navigation happens, including via the back button', async () => {
    const fixture = await render('mobile');
    root(fixture).querySelector<HTMLButtonElement>('.header__menu')?.click();
    fixture.detectChanges();
    expect(root(fixture).querySelector('.drawer__panel')).not.toBeNull();

    await TestBed.inject(Router).navigateByUrl('/customers');
    fixture.detectChanges();

    // A drawer still covering the screen after the route changed is the bug
    // that a link-click handler alone does not catch.
    expect(root(fixture).querySelector('.drawer__panel')).toBeNull();
  });

  it('closes the drawer if the window grows past the mobile layout', async () => {
    const fixture = await render('mobile');
    root(fixture).querySelector<HTMLButtonElement>('.header__menu')?.click();
    fixture.detectChanges();

    layout.current.set('desktop');
    fixture.detectChanges();

    // Otherwise a modal overlay sits on top of a layout that already has a
    // permanent sidebar.
    expect(root(fixture).querySelector('.drawer__panel')).toBeNull();
    expect(root(fixture).querySelector('.shell__sidebar')).not.toBeNull();
  });

  describe('the signed-in user', () => {
    it('is named in the header with their role, which explains what they can do', async () => {
      const fixture = await render('desktop', [provideSignedInAs('manager')]);

      const user = root(fixture).querySelector('[data-testid="current-user"]');
      expect(user?.textContent).toContain('Morgan Manager');
      expect(user?.textContent).toContain('Manager');
    });

    it('signs out, and leaves the application for the sign-in page', async () => {
      const fixture = await render('desktop', [provideSignedInAs('manager')]);
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/customers');

      root(fixture).querySelector<HTMLElement>('[data-testid="sign-out"] button')?.click();
      await fixture.whenStable();

      expect(TestBed.inject(SessionService).status()).toBe('anonymous');
      expect(router.url).toBe('/login');
      fixture.detectChanges();
      // Nobody is signed in, so there is nobody to name.
      expect(root(fixture).querySelector('[data-testid="current-user"]')).toBeNull();
    });
  });
});
