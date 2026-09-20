import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Select, type SelectOption } from './select';

@Component({
  selector: 'app-select-host',
  imports: [ReactiveFormsModule, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-select
      [formControl]="control"
      label="Status"
      [options]="options()"
      [placeholder]="placeholder()"
    />
  `,
})
class SelectHost {
  readonly control = new FormControl('', { nonNullable: true });
  readonly options = signal<readonly SelectOption[]>([
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'ARCHIVED', label: 'Archived', disabled: true },
  ]);
  readonly placeholder = signal('');
}

describe('Select', () => {
  async function render() {
    await TestBed.configureTestingModule({ imports: [SelectHost] }).compileComponents();
    const fixture = TestBed.createComponent(SelectHost);
    fixture.detectChanges();
    return fixture;
  }

  function select(fixture: { nativeElement: unknown }): HTMLSelectElement {
    const element = (fixture.nativeElement as HTMLElement).querySelector('select');
    if (!element) {
      throw new Error('no select rendered');
    }
    return element;
  }

  it('associates the label with the control', async () => {
    const fixture = await render();
    const label = (fixture.nativeElement as HTMLElement).querySelector('label');

    expect(label?.getAttribute('for')).toBe(select(fixture).id);
    expect(label?.textContent?.trim()).toBe('Status');
  });

  it('renders the options in the order given, disabled state included', async () => {
    const fixture = await render();
    const options = Array.from(select(fixture).options);

    expect(options.map((option) => option.value)).toEqual(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
    expect(options[2].disabled).toBe(true);
  });

  it('adds an empty option only when a placeholder is given', async () => {
    const fixture = await render();
    expect(select(fixture).options).toHaveLength(3);

    // Omitting the placeholder is how a caller makes the choice mandatory.
    fixture.componentInstance.placeholder.set('Any status');
    fixture.detectChanges();

    expect(select(fixture).options).toHaveLength(4);
    expect(select(fixture).options[0].value).toBe('');
  });

  it('reports the chosen value to the form control', async () => {
    const fixture = await render();
    const element = select(fixture);

    element.value = 'INACTIVE';
    element.dispatchEvent(new Event('change'));

    expect(fixture.componentInstance.control.value).toBe('INACTIVE');
  });

  it('shows a value the form already had before the first render', async () => {
    // The case a select gets wrong: the value arrives from a bookmarked URL or
    // a loaded record, so it is set before any option exists. Binding the
    // select's `value` property would silently drop it and render an empty
    // field that says the filter is not applied.
    await TestBed.configureTestingModule({ imports: [SelectHost] }).compileComponents();
    const fixture = TestBed.createComponent(SelectHost);
    fixture.componentInstance.control.setValue('INACTIVE');
    fixture.detectChanges();

    expect(select(fixture).value).toBe('INACTIVE');
  });

  it('shows a value written by the form', async () => {
    const fixture = await render();
    fixture.componentInstance.control.setValue('ARCHIVED');
    fixture.detectChanges();

    expect(select(fixture).value).toBe('ARCHIVED');
  });

  it('follows the form when the control is disabled', async () => {
    const fixture = await render();
    fixture.componentInstance.control.disable();
    fixture.detectChanges();

    expect(select(fixture).disabled).toBe(true);
  });
});
