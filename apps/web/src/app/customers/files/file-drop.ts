import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

let nextId = 0;

/**
 * Choose a file by browsing or by dropping it here.
 *
 * Two callers - the avatar upload and the CSV import - which is the reason it
 * exists rather than two copies of the same drag-and-drop handlers.
 *
 * ## Accessible first, draggable second
 *
 * The control is a real `<input type="file">` inside a `<label>`, so a
 * keyboard user tabs to it and presses Enter, and a screen reader announces
 * it as what it is. Drag and drop is layered on top for pointer users; it is
 * never the only way in.
 *
 * `accept` narrows the browser's file picker, which is a convenience: it does
 * not stop a file being dropped, and a user can switch the picker to "All
 * files". The caller validates what arrives with `checkFile`, and the server
 * validates it again.
 *
 * It selects; it does not validate, upload or preview. Those differ between
 * its two callers, and belong to them.
 */
@Component({
  selector: 'app-file-drop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-dragging]': 'dragging() ? "" : null',
    '[attr.data-disabled]': 'disabled() ? "" : null',
    '(dragenter)': 'onDragOver($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'dragging.set(false)',
    '(drop)': 'onDrop($event)',
  },
  template: `
    <label class="drop" [attr.for]="inputId">
      <span class="drop__label">{{ label() }}</span>
      @if (hint()) {
        <span class="drop__hint" [id]="hintId">{{ hint() }}</span>
      }
    </label>
    <input
      class="drop__input"
      type="file"
      [id]="inputId"
      [attr.accept]="accept()"
      [attr.aria-describedby]="hint() ? hintId : null"
      [disabled]="disabled()"
      (change)="onPicked($event)"
      data-testid="file-input"
    />
  `,
  styles: `
    :host {
      display: block;
      position: relative;
    }

    .drop {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-1);
      min-height: 7rem;
      padding: var(--space-4);
      border: 2px dashed var(--border-strong);
      border-radius: var(--radius-lg);
      background-color: var(--surface-sunken);
      color: var(--text-primary);
      text-align: center;
      cursor: pointer;
    }

    :host([data-dragging]) .drop {
      border-color: var(--accent);
      background-color: var(--accent-subtle);
    }

    :host([data-disabled]) .drop {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .drop__label {
      font-weight: var(--weight-medium);
    }

    .drop__hint {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    /* Covers the drop zone, so the whole area is the control - click and
       drop both land on the real input. Transparent, never display:none,
       which would take it out of the tab order. */
    .drop__input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }

    .drop__input:focus-visible {
      opacity: 1;
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
      background: transparent;
      color: transparent;
    }
  `,
})
export class FileDrop {
  readonly label = input.required<string>();
  readonly hint = input('');
  /** Narrows the picker, e.g. `.csv,text/csv`. A convenience, not validation. */
  readonly accept = input('');
  readonly disabled = input(false);

  readonly fileSelected = output<File>();

  protected readonly dragging = signal(false);
  protected readonly inputId = `file-drop-${nextId}`;
  protected readonly hintId = `file-drop-hint-${nextId++}`;

  protected onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared, so choosing the same file again after a failure still fires.
    input.value = '';
    if (file) {
      this.fileSelected.emit(file);
    }
  }

  protected onDragOver(event: DragEvent): void {
    if (this.disabled()) {
      return;
    }
    // Without preventDefault the browser refuses the drop - and, worse,
    // navigates to the file when it is let go.
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file && !this.disabled()) {
      this.fileSelected.emit(file);
    }
  }
}
