import type { AbstractControl, ValidationErrors } from '@angular/forms';
import type { ValidationError } from '../../core/errors/app-error';
import type { CustomerForm } from './customer-form-model';

/**
 * Turning validation errors into something a user can read.
 *
 * Two sources have to end up in the same place - the validators that run as
 * the user types, and the field errors a 422 carries back - and this is where
 * they are merged. The Phase 1 note on `app-text-input` was about exactly
 * this: the component takes an already-translated message, and deciding what
 * that message is belongs here, to the form, not to a generic input.
 *
 * ## Why the server's own text is never shown
 *
 * `FieldErrors` maps a dotted field path to messages, and those messages are
 * documented in `@ecm/contracts` as developer-facing: they are English
 * sentences produced by the schema, they name internal field paths, and they
 * cannot be translated. Rendering them would break two rules at once - no raw
 * backend errors, and no untranslated user-facing text.
 *
 * So the server's answer is used for **which field**, and the client supplies
 * **what to say**. That is less specific than the sentence the server had, and
 * it is the honest consequence of an API that returns prose rather than codes.
 * It is recorded as technical debt rather than papered over.
 */

/** Marks a control as rejected by the server. Cleared on the next edit. */
export const SERVER_ERROR = 'server';

const ERROR_PRIORITY: readonly string[] = [
  'required',
  'invalidEmail',
  'invalidPhone',
  'invalidCountry',
  'invalidDate',
  'futureDate',
  'tooLong',
  'tooManyTags',
  'tagTooLong',
  'emailTaken',
  SERVER_ERROR,
];

/**
 * The translation key and parameters for a control's first error.
 *
 * One message at a time, in a fixed order of importance: a field that is both
 * empty and too long is empty, and telling a user two things about one field
 * makes them read neither.
 */
export function firstError(
  errors: ValidationErrors | null,
): { key: string; params: Record<string, unknown> } | null {
  if (!errors) {
    return null;
  }

  for (const name of ERROR_PRIORITY) {
    if (name in errors) {
      const detail = errors[name];
      return {
        key: `customers.validation.${name}`,
        params:
          typeof detail === 'object' && detail !== null ? (detail as Record<string, unknown>) : {},
      };
    }
  }

  // An error nobody added a message for still has to say something, rather
  // than rendering an empty paragraph that looks like a layout bug.
  return { key: 'customers.validation.invalid', params: {} };
}

/** True once the user has had a chance to fix it: touched, or a save attempted. */
export function shouldShow(control: AbstractControl, submitted: boolean): boolean {
  return control.invalid && (control.touched || submitted);
}

/**
 * Applies a 422's field errors to the form.
 *
 * Paths are dotted (`address.city`), which `FormGroup.get` understands
 * directly - the contract chose that spelling for this reason. Anything that
 * does not match a control, including the `_` key the envelope uses for
 * whole-payload problems, is returned so the page can show it above the form
 * rather than losing it.
 */
export function applyServerFieldErrors(
  form: CustomerForm,
  fieldErrors: ValidationError['fieldErrors'],
): string[] {
  const unmatched: string[] = [];

  for (const path of Object.keys(fieldErrors)) {
    const control = form.get(path);
    if (control) {
      control.setErrors({ ...(control.errors ?? {}), [SERVER_ERROR]: true });
      // Marked touched so the message is visible immediately: the user has
      // already pressed save, so waiting for a blur would show nothing.
      control.markAsTouched();
    } else {
      unmatched.push(path);
    }
  }

  return unmatched;
}

/**
 * Removes the server's verdict from a control.
 *
 * Called when the value changes: the server rejected the old value, and
 * leaving the error in place would keep a corrected field marked as wrong.
 */
export function clearServerError(control: AbstractControl): void {
  if (!control.errors || !(SERVER_ERROR in control.errors)) {
    return;
  }
  const rest: ValidationErrors = {};
  for (const [name, detail] of Object.entries(control.errors)) {
    if (name !== SERVER_ERROR) {
      rest[name] = detail;
    }
  }
  control.setErrors(Object.keys(rest).length ? rest : null);
}
