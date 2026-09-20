import type { AsyncValidatorFn } from '@angular/forms';
import type { CustomerId } from '@ecm/contracts';
import { catchError, first, map, of, switchMap, timer } from 'rxjs';
import type { CustomerStore } from '../state/customer-store';

/** Typing has to stop for this long before the server is asked. */
export const EMAIL_CHECK_DEBOUNCE_MS = 400;

/**
 * Asks the server whether an email address is already taken.
 *
 * The one rule in this form that the client genuinely cannot answer on its
 * own, which is what makes it a real async validator rather than a
 * demonstration of one.
 *
 * Three decisions are worth reading:
 *
 *  - **The debounce is inside the validator.** Angular re-runs an async
 *    validator on every value change and unsubscribes the previous run, so a
 *    leading `timer` means the request is only ever made once typing settles -
 *    and the cancellation comes free from the framework rather than from a
 *    flag comparing request ids.
 *  - **A failed check does not block the form.** If the network is down, the
 *    honest answer is "I do not know", and refusing to let the user save
 *    because of it would be worse than letting the server decide - which it
 *    does anyway, with a 409 the page handles.
 *  - **It skips a value the synchronous validators already rejected.** Asking
 *    whether "not an email" is taken wastes a request to answer a question the
 *    user is already being told about.
 */
export function emailAvailabilityValidator(
  store: CustomerStore,
  excludeId: () => CustomerId | null,
): AsyncValidatorFn {
  return (control) => {
    const email = String(control.value ?? '').trim();
    const blockedBySyncErrors =
      control.hasError('required') ||
      control.hasError('invalidEmail') ||
      control.hasError('tooLong');

    if (!email || blockedBySyncErrors) {
      return of(null);
    }

    return timer(EMAIL_CHECK_DEBOUNCE_MS).pipe(
      switchMap(() => store.isEmailAvailable(email, excludeId())),
      map((available) => (available ? null : { emailTaken: true })),
      catchError(() => of(null)),
      // An async validator must complete, or the control stays PENDING for
      // ever and the submit button never enables.
      first(),
    );
  };
}
