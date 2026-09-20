import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dropdown, type DropdownItem } from './dropdown';

@Component({
  selector: 'app-dropdown-host',
  imports: [Dropdown],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-dropdown [items]="items()" menuLabel="Colour theme" (selected)="chosen.set($event)">
      Theme
    </app-dropdown>
  `,
})
class DropdownHost {
  readonly items = signal<readonly DropdownItem[]>([
    { id: 'light', label: 'Light', selected: true },
    { id: 'dark', label: 'Dark' },
    { id: 'system', label: 'Match the system', disabled: true },
  ]);
  readonly chosen = signal<string | null>(null);
}

/**
 * CDK reads `keyCode` as well as `key`, and jsdom's KeyboardEvent constructor
 * ignores `keyCode` in its init object - so it has to be defined afterwards or
 * the event is silently ignored.
 */
function escapeKeydown(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  Object.defineProperty(event, 'keyCode', { get: () => 27 });
  return event;
}

/**
 * The menu renders into the CDK overlay container, outside the fixture, so
 * every query below goes through the document rather than the component's own
 * element. Getting that wrong is the usual reason an overlay test "passes".
 */
describe('Dropdown', () => {
  async function render() {
    await TestBed.configureTestingModule({ imports: [DropdownHost] }).compileComponents();
    const fixture = TestBed.createComponent(DropdownHost);
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();
    return fixture;
  }

  function trigger(fixture: { nativeElement: unknown }): HTMLButtonElement {
    const element = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.dropdown__trigger',
    );
    if (!element) {
      throw new Error('no trigger rendered');
    }
    return element;
  }

  function menuItems(): HTMLButtonElement[] {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('.dropdown__item'));
  }

  it('tells assistive technology that it opens a menu, and whether it is open', async () => {
    const fixture = await render();
    const button = trigger(fixture);

    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');

    button.click();
    fixture.detectChanges();

    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders the items only once opened', async () => {
    const fixture = await render();
    expect(menuItems()).toHaveLength(0);

    trigger(fixture).click();
    fixture.detectChanges();

    expect(menuItems().map((item) => item.textContent?.trim())).toEqual([
      'Light',
      'Dark',
      'Match the system',
    ]);
  });

  it('emits the id of the chosen item, not its label', async () => {
    const fixture = await render();
    trigger(fixture).click();
    fixture.detectChanges();

    menuItems()[1].click();
    fixture.detectChanges();

    // An id, so a rename of the label never changes behaviour.
    expect(fixture.componentInstance.chosen()).toBe('dark');
  });

  it('marks the item the current state corresponds to', async () => {
    const fixture = await render();
    trigger(fixture).click();
    fixture.detectChanges();

    expect(menuItems()[0].getAttribute('aria-current')).toBe('true');
    expect(menuItems()[1].getAttribute('aria-current')).toBeNull();
  });

  it('does not act on a disabled item', async () => {
    const fixture = await render();
    trigger(fixture).click();
    fixture.detectChanges();

    menuItems()[2].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.chosen()).toBeNull();
  });

  it('closes on Escape and gives focus back to the trigger', async () => {
    const fixture = await render();
    const button = trigger(fixture);
    button.focus();
    button.click();
    fixture.detectChanges();

    document.querySelector('.dropdown__menu')?.dispatchEvent(escapeKeydown());
    fixture.detectChanges();

    // Closing is only half of it: a menu that closes and leaves focus on the
    // document body strands a keyboard user at the top of the page.
    expect(document.querySelector('.dropdown__menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
