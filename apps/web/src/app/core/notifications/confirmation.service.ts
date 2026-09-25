import { Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import type { MessageParams } from './notification.service';

/**
 * Asks the user a yes-or-no question in a dialog, and answers with an
 * observable.
 *
 *     confirmation.confirm({ headingKey, bodyKey, confirmKey, tone: 'danger' })
 *       .subscribe((yes) => ...)
 *
 * One dialog, rendered once by the shell (`app-confirmation-host`), instead of
 * an `<app-dialog>` and three signals repeated in every component that needs
 * to ask something. Two callers use it today: leaving a form with unsaved
 * changes, and bulk delete.
 *
 * ## What it is not for
 *
 * A dialog that has to show the *outcome* of what it asked - the detail page's
 * delete, which stays open with the error if the delete fails - is a dialog of
 * its own, not a confirmation. This answers a question and closes.
 *
 * ## One question at a time
 *
 * A second `confirm()` while one is open answers the first with `false`. Two
 * stacked modal questions are a design error; cancelling the older one is the
 * answer that loses nothing.
 */

export interface ConfirmationRequest {
  readonly headingKey: string;
  readonly bodyKey: string;
  readonly confirmKey: string;
  readonly cancelKey?: string;
  readonly params?: MessageParams;
  /** `danger` for an action that destroys something; the button says so. */
  readonly tone?: 'primary' | 'danger';
}

interface PendingConfirmation {
  readonly request: ConfirmationRequest;
  readonly answer: (confirmed: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmationService {
  private readonly pendingState = signal<PendingConfirmation | null>(null);

  /** The question on screen, if any. Read by the host component. */
  readonly pending = this.pendingState.asReadonly();

  confirm(request: ConfirmationRequest): Observable<boolean> {
    return new Observable<boolean>((subscriber) => {
      this.pendingState()?.answer(false);

      let answered = false;
      const answer = (confirmed: boolean): void => {
        if (answered) {
          return;
        }
        answered = true;
        if (this.pendingState()?.answer === answer) {
          this.pendingState.set(null);
        }
        subscriber.next(confirmed);
        subscriber.complete();
      };

      this.pendingState.set({ request, answer });
      // Unsubscribing withdraws the question - a navigation that no longer
      // needs the answer must not leave a dialog behind.
      return () => {
        if (!answered && this.pendingState()?.answer === answer) {
          this.pendingState.set(null);
        }
      };
    });
  }

  /** Called by the host when the user answers. */
  answer(confirmed: boolean): void {
    this.pendingState()?.answer(confirmed);
  }
}
