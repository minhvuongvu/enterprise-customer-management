import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TextInput } from './text-input';

@Component({
  selector: 'app-text-input-host',
  imports: [ReactiveFormsModule, TextInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-text-input
      [formControl]="control"
      [label]="label()"
      [hint]="hint()"
      [error]="error()"
      [required]="required()"
    />
  `,
})
class TextInputHost {
  readonly control = new FormControl('', { nonNullable: true });
  readonly label = signal('Full name');
  readonly hint = signal('');
  readonly error = signal('');
  readonly required = signal(false);
}

describe('TextInput', () => {
  async function render() {
    await TestBed.configureTestingModule({ imports: [TextInputHost] }).compileComponents();
    const fixture = TestBed.createComponent(TextInputHost);
    fixture.detectChanges();
    return fixture;
  }

  function input(fixture: { nativeElement: unknown }): HTMLInputElement {
    const element = (fixture.nativeElement as HTMLElement).querySelector('input');
    if (!element) {
      throw new Error('no input rendered');
    }
    return element;
  }

  it('associates the label with the control', async () => {
    const fixture = await render();
    const root = fixture.nativeElement as HTMLElement;
    const label = root.querySelector('label');

    // Not "a label element exists" - the pair has to match, or clicking the
    // label does nothing and a screen reader announces an unlabelled field.
    expect(label?.getAttribute('for')).toBe(input(fixture).id);
    expect(label?.textContent).toContain('Full name');
  });

  it('reports what the user types back to the form control', async () => {
    const fixture = await render();
    const element = input(fixture);

    element.value = 'Ada';
    element.dispatchEvent(new Event('input'));

    expect(fixture.componentInstance.control.value).toBe('Ada');
  });

  it('shows a value written by the form', async () => {
    const fixture = await render();
    fixture.componentInstance.control.setValue('Grace');
    fixture.detectChanges();

    expect(input(fixture).value).toBe('Grace');
  });

  it('marks the control touched on blur, so a form can wait before complaining', async () => {
    const fixture = await render();
    expect(fixture.componentInstance.control.touched).toBe(false);

    input(fixture).dispatchEvent(new Event('blur'));

    expect(fixture.componentInstance.control.touched).toBe(true);
  });

  it('describes the field with the hint and the error that actually exist', async () => {
    const fixture = await render();
    const element = input(fixture);

    // Nothing to describe: the attribute must be absent, not empty, and must
    // never point at an element that is not rendered.
    expect(element.getAttribute('aria-describedby')).toBeNull();

    fixture.componentInstance.hint.set('As it appears on the contract');
    fixture.detectChanges();
    expect(element.getAttribute('aria-describedby')).toBe(`${element.id}-hint`);

    fixture.componentInstance.error.set('Required');
    fixture.detectChanges();
    expect(element.getAttribute('aria-describedby')).toBe(`${element.id}-hint ${element.id}-error`);
  });

  it('announces an error and marks the field invalid', async () => {
    const fixture = await render();
    fixture.componentInstance.error.set('Enter a name');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(input(fixture).getAttribute('aria-invalid')).toBe('true');
    // Announced when it appears, not only when the field is focused again.
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Enter a name');
  });

  it('follows the form when the control is disabled', async () => {
    const fixture = await render();
    fixture.componentInstance.control.disable();
    fixture.detectChanges();

    expect(input(fixture).disabled).toBe(true);
  });
});
