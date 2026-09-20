import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Button } from './button';

/**
 * Hosts the button the way a page does, so the tests exercise what a caller
 * actually sees: projected content, a click that has to travel out of the
 * component, and the element it chose to render.
 */
@Component({
  selector: 'app-button-host',
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-button
      [disabled]="disabled()"
      [loading]="loading()"
      [link]="link()"
      [type]="type()"
      (click)="clicks.set(clicks() + 1)"
    >
      Save
    </app-button>
  `,
})
class ButtonHost {
  readonly disabled = signal(false);
  readonly loading = signal(false);
  readonly link = signal<string | null>(null);
  readonly type = signal<'button' | 'submit'>('button');
  readonly clicks = signal(0);
}

describe('Button', () => {
  async function render() {
    await TestBed.configureTestingModule({
      imports: [ButtonHost],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(ButtonHost);
    fixture.detectChanges();
    return fixture;
  }

  it('renders a real button, not a styled div', async () => {
    const fixture = await render();
    const element = (fixture.nativeElement as HTMLElement).querySelector('button');

    expect(element).not.toBeNull();
    // Inside a form, a button without an explicit type submits it. Defaulting
    // to "button" means adding a button to a form never submits it by accident.
    expect(element?.getAttribute('type')).toBe('button');
    expect(element?.textContent?.trim()).toBe('Save');
  });

  it('can be a submit button when the caller asks for one', async () => {
    const fixture = await render();
    fixture.componentInstance.type.set('submit');
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('button')?.getAttribute('type'),
    ).toBe('submit');
  });

  it('does not deliver a click while disabled', async () => {
    const fixture = await render();
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector('button')?.click();

    expect(fixture.componentInstance.clicks()).toBe(0);
  });

  it('treats loading as disabled and says so to assistive technology', async () => {
    const fixture = await render();
    fixture.componentInstance.loading.set(true);
    fixture.detectChanges();

    const element = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(element?.disabled).toBe(true);
    expect(element?.getAttribute('aria-busy')).toBe('true');

    // A second press while a request is in flight is the bug this prevents.
    element?.click();
    expect(fixture.componentInstance.clicks()).toBe(0);
  });

  it('renders an anchor with a real href when given a destination', async () => {
    const fixture = await render();
    fixture.componentInstance.link.set('/customers/new');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const anchor = root.querySelector('a');

    expect(root.querySelector('button')).toBeNull();
    // An href, not a click handler: middle click and "open in new tab" work.
    expect(anchor?.getAttribute('href')).toBe('/customers/new');
    expect(anchor?.textContent?.trim()).toBe('Save');
  });
});
