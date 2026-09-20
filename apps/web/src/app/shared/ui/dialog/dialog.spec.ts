import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Dialog } from './dialog';
import translations from '../../../core/i18n/translations/en.json';

@Component({
  selector: 'app-dialog-host',
  imports: [Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" id="trigger" (click)="open.set(true)">Delete</button>

    <app-dialog [open]="open()" heading="Delete this customer?" (closed)="open.set(false)">
      <p>This cannot be undone.</p>
      <div dialogActions>
        <button type="button" id="confirm">Confirm</button>
      </div>
    </app-dialog>
  `,
})
class DialogHost {
  readonly open = signal(false);
}

/**
 * These tests are about behaviour a sighted mouse user never notices and a
 * keyboard user cannot work around. Each one corresponds to a line in the
 * component's own documentation.
 */
describe('Dialog', () => {
  async function render() {
    await TestBed.configureTestingModule({
      imports: [
        DialogHost,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DialogHost);
    // Attaching to the document is required: focus does not move inside a
    // detached tree, so every assertion below would pass for the wrong reason.
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();
    return fixture;
  }

  it('renders nothing while closed', async () => {
    const fixture = await render();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]')).toBeNull();
  });

  it('is a labelled modal when open', async () => {
    const fixture = await render();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();

    const dialog = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');

    const labelId = dialog?.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(dialog?.querySelector(`#${labelId}`)?.textContent).toContain('Delete this customer?');
  });

  it('wires the focus trap, with capture', async () => {
    const fixture = await render();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();

    const dialog = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]');

    // Only the wiring is asserted here. Whether focus actually *moves* cannot
    // be tested in jsdom: CDK decides an element is focusable by measuring it,
    // and jsdom gives every element zero size, so the trap finds nothing to
    // focus. e2e/layout.spec.ts checks the real behaviour in a real browser -
    // focus entering the dialog, staying inside it, and returning to the
    // trigger on close.
    expect(dialog?.hasAttribute('cdkTrapFocus')).toBe(true);
  });

  it('closes on Escape', async () => {
    const fixture = await render();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]');
    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('closes when the area outside is dismissed, and that area is a real control', async () => {
    const fixture = await render();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const dismiss = root.querySelector<HTMLButtonElement>('.scrim__dismiss');

    expect(dismiss?.tagName).toBe('BUTTON');
    expect(dismiss?.getAttribute('aria-label')).toBe('Dismiss the dialog');

    dismiss?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('keeps a click inside the dialog from closing it', async () => {
    const fixture = await render();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('#confirm')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.open()).toBe(true);
  });
});
