import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Unique within a document; see the note on `inputId` below. */
let nextId = 0;

/**
 * A labelled single-line text field.
 *
 * The reason this exists rather than a bare `<input>`: the wiring that makes a
 * field accessible - a real `<label for>`, `aria-describedby` pointing at both
 * the hint and the error, `aria-invalid`, and an error that is announced when
 * it appears - is four attributes that must agree with each other, and they
 * get out of step the moment they are written by hand in twenty forms.
 *
 * It is a `ControlValueAccessor`, so it drops into the reactive forms Phase 2
 * builds. What it deliberately does *not* do is decide when it is invalid: the
 * caller passes `error` as an already-translated message. Deriving that from
 * the control means merging client validators with the server's `fieldErrors`,
 * which is a form-layer concern and belongs to Phase 2 - not to a component
 * that must stay domain-agnostic.
 */
@Component({
  selector: 'app-text-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TextInput),
      multi: true,
    },
  ],
  template: `
    <div class="field">
      <label class="field__label" [attr.for]="inputId">
        {{ label() }}
        @if (required()) {
          <span aria-hidden="true">*</span>
        }
      </label>

      <input
        class="field__control"
        [id]="inputId"
        [attr.type]="type()"
        [attr.name]="name() || null"
        [attr.placeholder]="placeholder() || null"
        [attr.autocomplete]="autocomplete() || null"
        [value]="value()"
        [disabled]="isDisabled()"
        [required]="required()"
        [attr.aria-invalid]="error() ? 'true' : null"
        [attr.aria-describedby]="describedBy()"
        (input)="handleInput($event)"
        (blur)="handleBlur()"
      />

      @if (hint()) {
        <p class="field__hint" [id]="hintId">{{ hint() }}</p>
      }
      @if (error()) {
        <!-- role="alert" so the message is announced when it appears, rather
             than only when the field is focused again. -->
        <p class="field__error" [id]="errorId" role="alert">{{ error() }}</p>
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

    .field__control[aria-invalid='true'] {
      border-color: var(--danger);
    }

    .field__hint {
      color: var(--text-muted);
      font-size: var(--text-sm);
    }

    .field__error {
      color: var(--danger-text);
      font-size: var(--text-sm);
    }
  `,
})
export class TextInput implements ControlValueAccessor {
  /** Already translated. A generic component owns no copy. */
  readonly label = input.required<string>();
  readonly type = input<'text' | 'email' | 'tel' | 'search' | 'password' | 'date'>('text');
  readonly name = input('');
  readonly placeholder = input('');
  readonly autocomplete = input('');
  readonly hint = input('');
  readonly error = input('');
  readonly required = input(false);

  /**
   * Stable per instance and unique per document.
   *
   * A counter rather than a random id: two renders of the same component tree
   * produce the same ids, which is what keeps server-rendered markup and its
   * hydrated counterpart identical.
   */
  protected readonly inputId = `app-input-${nextId++}`;
  protected readonly hintId = `${this.inputId}-hint`;
  protected readonly errorId = `${this.inputId}-error`;

  protected readonly value = signal('');
  protected readonly isDisabled = signal(false);

  /**
   * Points at whichever of hint and error is currently rendered.
   *
   * Referencing an element that does not exist is not a harmless no-op: some
   * screen readers announce nothing at all for the whole field.
   */
  protected readonly describedBy = computed(() => {
    const ids = [this.hint() ? this.hintId : '', this.error() ? this.errorId : ''].filter(Boolean);
    return ids.length ? ids.join(' ') : null;
  });

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

  protected handleInput(event: Event): void {
    const next = (event.target as HTMLInputElement).value;
    this.value.set(next);
    this.onChange(next);
  }

  protected handleBlur(): void {
    this.onTouched();
  }
}
