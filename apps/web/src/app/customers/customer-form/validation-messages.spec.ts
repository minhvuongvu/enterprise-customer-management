import { createCustomerForm, type CustomerForm } from './customer-form-model';
import {
  applyServerFieldErrors,
  clearServerError,
  firstError,
  SERVER_ERROR,
  shouldShow,
} from './validation-messages';

describe('firstError', () => {
  it('says nothing when there is nothing wrong', () => {
    expect(firstError(null)).toBeNull();
  });

  it('reports one problem at a time, in order of importance', () => {
    // Telling a user two things about one field makes them read neither.
    const error = firstError({ tooLong: { max: 10 }, required: true });
    expect(error?.key).toBe('customers.validation.required');
  });

  it('passes the detail a validator attached through as message parameters', () => {
    expect(firstError({ tooLong: { max: 150 } })).toEqual({
      key: 'customers.validation.tooLong',
      params: { max: 150 },
    });
  });

  it('still says something for an error nobody wrote a message for', () => {
    // An empty paragraph where an error belongs reads as a layout bug.
    expect(firstError({ somethingNew: true })?.key).toBe('customers.validation.invalid');
  });
});

describe('shouldShow', () => {
  it('waits until the user has had a chance, or has pressed save', () => {
    const form = createCustomerForm();
    const control = form.controls.fullName;

    expect(shouldShow(control, false)).toBe(false);
    expect(shouldShow(control, true)).toBe(true);

    control.markAsTouched();
    expect(shouldShow(control, false)).toBe(true);
  });
});

describe('server field errors', () => {
  let form: CustomerForm;

  beforeEach(() => {
    form = createCustomerForm();
    form.patchValue({ fullName: 'A', email: 'a@b.test' });
  });

  it('marks the control the server named, using the dotted path', () => {
    const unmatched = applyServerFieldErrors(form, { 'address.city': ['Required'] });

    expect(unmatched).toEqual([]);
    expect(form.controls.address.controls.city.hasError(SERVER_ERROR)).toBe(true);
    // Touched as well, or the message would wait for a blur that will never
    // come - the user has already pressed save.
    expect(form.controls.address.controls.city.touched).toBe(true);
  });

  it('hands back anything that is not a field, so the page can show it', () => {
    // `_` is the envelope's key for a problem with the payload as a whole.
    expect(applyServerFieldErrors(form, { _: ['Unknown key'] })).toEqual(['_']);
  });

  it('keeps the errors a validator already found', () => {
    form.controls.email.setValue('not-an-email');
    applyServerFieldErrors(form, { email: ['Invalid'] });

    expect(form.controls.email.hasError('invalidEmail')).toBe(true);
    expect(form.controls.email.hasError(SERVER_ERROR)).toBe(true);
  });

  it('forgets the server verdict once the value changes', () => {
    applyServerFieldErrors(form, { fullName: ['Too long'] });
    clearServerError(form.controls.fullName);

    // The server rejected the old value. Leaving the mark would keep a
    // corrected field looking wrong.
    expect(form.controls.fullName.hasError(SERVER_ERROR)).toBe(false);
    expect(form.controls.fullName.valid).toBe(true);
  });
});
