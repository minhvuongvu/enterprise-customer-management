import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

let nextId = 0;

/**
 * A modal dialog.
 *
 * Modality is an accessibility contract, not a visual effect. Four things have
 * to hold or the dialog is a trap for some users and a no-op for others:
 *
 *  1. focus moves into the dialog when it opens;
 *  2. focus cannot leave it by Tab while it is open;
 *  3. Escape closes it;
 *  4. focus returns to whatever opened it.
 *
 * CDK's `cdkTrapFocus` with `autoCapture` provides 1, 2 and 4 - including the
 * hard part of 4, which is remembering the trigger across a re-render. Writing
 * that by hand is a well-known source of "the page still works but keyboard
 * users are stuck", so this composes rather than reimplements. 3 is one
 * binding, and is here.
 *
 * Open state belongs to the caller: `[open]` in, `(closed)` out. A dialog that
 * owned its own visibility would need a template reference and an imperative
 * `open()` call at every call site, and the state that decides whether it
 * should be open - "is a customer selected" - lives with the caller anyway.
 *
 * Two deliberate limits, both of which Phase 4 may need to revisit when it
 * adds real confirmation flows:
 *
 *  - it renders inline rather than in a CDK overlay, so an ancestor with a
 *    `transform` would break `position: fixed`;
 *  - it does not lock background scrolling.
 */
@Component({
  selector: 'app-dialog',
  imports: [A11yModule, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="scrim" *transloco="let t">
        <div
          class="dialog"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="headingId"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          (keydown.escape)="close()"
        >
          <header class="dialog__header">
            <h2 class="dialog__heading" [id]="headingId">{{ heading() }}</h2>
            <button
              type="button"
              class="dialog__close"
              [attr.aria-label]="t('ui.dialog.close')"
              (click)="close()"
            >
              <span class="dialog__close-icon" aria-hidden="true"></span>
            </button>
          </header>

          <div class="dialog__body"><ng-content /></div>

          <footer class="dialog__footer"><ng-content select="[dialogActions]" /></footer>
        </div>

        <!--
          Dismissing by clicking outside, as a real button rather than a click
          handler on the backdrop div. A div with a click handler is invisible
          to a keyboard and to assistive technology, which is why lint rejects
          it; a button is announced and operable.

          It comes after the dialog in the DOM - and only sits behind it
          visually - so focus lands on the dialog's own controls first and this
          is the last stop, rather than the first thing a keyboard user meets.
        -->
        <button
          type="button"
          class="scrim__dismiss"
          [attr.aria-label]="t('ui.dialog.dismiss')"
          (click)="close()"
        ></button>
      </div>
    }
  `,
  styles: `
    .scrim {
      position: fixed;
      inset: 0;
      z-index: var(--z-overlay);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
      background-color: var(--scrim);
    }

    .scrim__dismiss {
      position: absolute;
      inset: 0;
      z-index: 0;
      border: none;
      background: transparent;
      cursor: default;
    }

    .dialog {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: min(32rem, 100%);
      max-height: min(85vh, 40rem);
      padding: var(--space-5);
      border-radius: var(--radius-lg);
      background-color: var(--surface-overlay);
      box-shadow: var(--shadow-lg);
    }

    .dialog__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-4);
    }

    .dialog__heading {
      font-size: var(--text-xl);
    }

    .dialog__close {
      padding: var(--space-1) var(--space-2);
      border: none;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
    }

    .dialog__close:hover {
      background-color: var(--surface-hover);
    }

    /* Drawn from CSS, not written as text: a glyph in the template is a text
       node, and every text node in this repository has to be a translation. */
    .dialog__close-icon::before {
      content: '\\2715';
    }

    .dialog__body {
      overflow-y: auto;
      color: var(--text-secondary);
    }

    .dialog__footer {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
    }

    .dialog__footer:empty {
      display: none;
    }

    /* On a phone the dialog fills the width and sits at the bottom, where a
       thumb reaches; actions stack instead of crowding one line. */
    @media (max-width: 47.99rem) {
      .scrim {
        align-items: flex-end;
        padding: 0;
      }

      .dialog {
        width: 100%;
        max-height: 90vh;
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      }

      .dialog__footer {
        flex-direction: column-reverse;
      }
    }
  `,
})
export class Dialog {
  readonly open = input(false);
  /** Already translated. */
  readonly heading = input.required<string>();

  readonly closed = output<void>();

  protected readonly headingId = `app-dialog-${nextId++}`;

  protected close(): void {
    this.closed.emit();
  }
}
