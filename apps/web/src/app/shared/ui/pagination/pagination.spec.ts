import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Pagination } from './pagination';
import translations from '../../../core/i18n/translations/en.json';

@Component({
  selector: 'app-pagination-host',
  imports: [Pagination],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-pagination
      [page]="page()"
      [totalPages]="totalPages()"
      (pageChange)="requested.set($event)"
    />
  `,
})
class PaginationHost {
  readonly page = signal(1);
  readonly totalPages = signal(5);
  readonly requested = signal<number | null>(null);
}

describe('Pagination', () => {
  async function render() {
    await TestBed.configureTestingModule({
      imports: [
        PaginationHost,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PaginationHost);
    fixture.detectChanges();
    return fixture;
  }

  function buttons(fixture: { nativeElement: unknown }): HTMLButtonElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.pagination__button',
      ),
    );
  }

  function pageButton(fixture: { nativeElement: unknown }, label: string) {
    return buttons(fixture).find((button) => button.textContent?.trim() === label);
  }

  it('is a labelled navigation landmark', async () => {
    const fixture = await render();
    const nav = (fixture.nativeElement as HTMLElement).querySelector('nav');

    expect(nav?.getAttribute('aria-label')).toBe('Pages');
  });

  it('says where the user is, in words as well as in colour', async () => {
    const fixture = await render();
    fixture.componentInstance.page.set(3);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Page 3 of 5');
    expect(pageButton(fixture, '3')?.getAttribute('aria-current')).toBe('page');
  });

  it('lists every page while there are few of them', async () => {
    const fixture = await render();

    const labels = buttons(fixture)
      .map((button) => button.textContent?.trim())
      .filter((text) => text !== '');
    expect(labels).toEqual(['1', '2', '3', '4', '5']);
  });

  it('windows the list rather than rendering two and a half thousand buttons', async () => {
    const fixture = await render();
    fixture.componentInstance.totalPages.set(2500);
    fixture.componentInstance.page.set(300);
    fixture.detectChanges();

    const labels = buttons(fixture)
      .map((button) => button.textContent?.trim())
      .filter((text) => text !== '');
    expect(labels).toEqual(['1', '299', '300', '301', '2500']);
  });

  it('asks for the page the user clicked', async () => {
    const fixture = await render();
    pageButton(fixture, '4')?.click();

    expect(fixture.componentInstance.requested()).toBe(4);
  });

  it('ignores a click on the page already shown', async () => {
    const fixture = await render();
    fixture.componentInstance.page.set(2);
    fixture.detectChanges();

    pageButton(fixture, '2')?.click();

    // Emitting would make the caller re-fetch what it already has.
    expect(fixture.componentInstance.requested()).toBeNull();
  });

  it('disables the step buttons at the ends instead of hiding them', async () => {
    const fixture = await render();
    const [previous] = buttons(fixture);
    const next = buttons(fixture).at(-1);

    // Hiding them would make the control's width jump between pages.
    expect(previous.disabled).toBe(true);
    expect(previous.getAttribute('aria-label')).toBe('Previous page');
    expect(next?.disabled).toBe(false);

    fixture.componentInstance.page.set(5);
    fixture.detectChanges();

    expect(buttons(fixture)[0].disabled).toBe(false);
    expect(buttons(fixture).at(-1)?.disabled).toBe(true);
  });

  it('labels each page button for a screen reader', async () => {
    const fixture = await render();

    expect(pageButton(fixture, '4')?.getAttribute('aria-label')).toBe('Go to page 4');
  });
});
