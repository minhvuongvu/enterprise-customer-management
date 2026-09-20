import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextId = 0;

/** A choice. `label` is already translated; the component owns no copy. */
export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

/**
 * A labelled single-choice field, built on the native `<select>`.
 *
 * A hand-built listbox would demonstrate more Angular, and would be worse: the
 * native control gets a platform-correct picker on every phone, the operating
 * system's own keyboard behaviour including type-ahead, and screen-reader
 * support that no amount of ARIA reproduces exactly.
 *
 * The rule this follows is the one worth remembering: replace a native control
 * only when the design genuinely cannot be expressed with it - multi-select
 * with chips, or options that are rich content. A styled dropdown is not one
 * of those cases.
 */
@Component({
  selector: 'app-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Select),
      multi: true,
    },
  ],
  template: `
    <div class="field">
      <label class="field__label" [attr.for]="selectId">{{ label() }}</label>

      <select
        class="field__control"
        [id]="selectId"
        [attr.name]="name() || null"
        [value]="value()"
        [disabled]="isDisabled()"
        [attr.aria-describedby]="hint() ? hintId : null"
        (change)="handleChange($event)"
        (blur)="handleBlur()"
      >
        @if (placeholder()) {
          <option value="">{{ placeholder() }}</option>
        }
        @for (option of options(); track option.value) {
          <option [value]="option.value" [disabled]="option.disabled ?? false">
            {{ option.label }}
          </option>
        }
      </select>

      @if (hint()) {
        <p class="field__hint" [id]="hintId">{{ hint() }}</p>
      }
    </div>
  `,
  styles: `
    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .field__label {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
    }

    .field__control {
      padding: var(--space-2) var(--space-3);
      border: var(--border-width) solid var(--border-strong);
      border-radius: var(--radius-md);
      background-color: var(--surface-raised);
      color: var(--text-primary);
    }

    .field__control:disabled {
      background-color: var(--surface-sunken);
      color: var(--text-muted);
      cursor: not-allowed;
    }

    .field__hint {
      color: var(--text-muted);
      font-size: var(--text-sm);
    }
  `,
})
export class Select implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly options = input.required<readonly SelectOption[]>();
  readonly name = input('');
  readonly hint = input('');
  /** Text for the empty option. Omit it to make a choice mandatory. */
  readonly placeholder = input('');

  protected readonly selectId = `app-select-${nextId++}`;
  protected readonly hintId = `${this.selectId}-hint`;

  protected readonly value = signal('');
  protected readonly isDisabled = signal(false);

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }

  protected handleChange(event: Event): void {
    const next = (event.target as HTMLSelectElement).value;
    this.value.set(next);
    this.onChange(next);
  }

  protected handleBlur(): void {
    this.onTouched();
  }
}
