import { aCustomer } from '../testing/customer.fixture';
import {
  createCustomerForm,
  isEmptyPatch,
  parseTags,
  toCreateRequest,
  toFormValue,
  toUpdateRequest,
  type CustomerForm,
} from './customer-form-model';

/**
 * The form's rules, tested as rules.
 *
 * Nothing here renders a component. A validator is a business rule wearing a
 * UI costume, and testing it through change detection makes the specification
 * harder to read without making it more true.
 */
describe('the customer form', () => {
  let form: CustomerForm;

  beforeEach(() => {
    form = createCustomerForm();
  });

  function fill(values: Record<string, unknown>): void {
    form.patchValue(values);
  }

  describe('required fields', () => {
    it('starts invalid, because a customer needs a name and an email', () => {
      expect(form.controls.fullName.hasError('required')).toBe(true);
      expect(form.controls.email.hasError('required')).toBe(true);
    });

    it('accepts the minimum a customer can be', () => {
      fill({ fullName: 'Nguyễn Văn A', email: 'an@example.test' });
      expect(form.valid).toBe(true);
    });
  });

  describe('format', () => {
    it('rejects something that is not an email address', () => {
      fill({ email: 'an@example' });
      expect(form.controls.email.hasError('invalidEmail')).toBe(true);

      fill({ email: 'an@example.test' });
      expect(form.controls.email.hasError('invalidEmail')).toBe(false);
    });

    it('accepts an international phone number, and rejects letters', () => {
      fill({ phone: '+84 (90) 000-0000' });
      expect(form.controls.phone.valid).toBe(true);

      fill({ phone: 'call me' });
      expect(form.controls.phone.hasError('invalidPhone')).toBe(true);
    });

    it('wants two letters for a country', () => {
      fill({ address: { country: 'Vietnam' } });
      expect(form.controls.address.controls.country.hasError('invalidCountry')).toBe(true);
    });
  });

  describe('length', () => {
    it('rejects a name longer than the contract allows, and says the limit', () => {
      fill({ fullName: 'a'.repeat(151) });
      expect(form.controls.fullName.getError('tooLong')).toEqual({ max: 150 });
    });

    it('rejects one tag that is too long, not the whole list', () => {
      fill({ tags: 'vip, ' + 'x'.repeat(41) });
      expect(form.controls.tags.hasError('tagTooLong')).toBe(true);
    });
  });

  describe('the date of birth', () => {
    it('rejects a date that is not on the calendar', () => {
      // Not just the shape: 30 February would otherwise roll into March.
      fill({ dateOfBirth: '2026-02-30' });
      expect(form.controls.dateOfBirth.hasError('invalidDate')).toBe(true);
    });

    it('rejects a birthday in the future', () => {
      fill({ dateOfBirth: '2999-01-01' });
      expect(form.controls.dateOfBirth.hasError('futureDate')).toBe(true);
    });

    it('accepts a real past date', () => {
      fill({ dateOfBirth: '1990-01-01' });
      expect(form.controls.dateOfBirth.valid).toBe(true);
    });
  });

  describe('cross-field rules', () => {
    it('leaves an entirely empty address alone', () => {
      fill({ fullName: 'A', email: 'a@b.test' });
      expect(form.controls.address.valid).toBe(true);
    });

    it('requires the parts that make a started address deliverable', () => {
      fill({ address: { line1: '1 Lê Lợi' } });

      expect(form.controls.address.getError('addressIncomplete')).toEqual({
        fields: ['city', 'country'],
      });

      fill({ address: { city: 'Hà Nội', country: 'VN' } });
      expect(form.controls.address.valid).toBe(true);
    });

    it('requires a phone number once the customer is active', () => {
      fill({ fullName: 'A', email: 'a@b.test', status: 'ACTIVE' });

      // The rule lives on the group because no single control can answer it.
      expect(form.hasError('phoneRequiredWhenActive')).toBe(true);
      expect(form.invalid).toBe(true);

      fill({ phone: '+84900000000' });
      expect(form.hasError('phoneRequiredWhenActive')).toBe(false);
    });
  });

  describe('parseTags', () => {
    it('trims, drops blanks and removes duplicates', () => {
      expect(parseTags(' vip , , vip, key account ')).toEqual(['vip', 'key account']);
    });
  });

  describe('the create payload', () => {
    it('sends null for an empty optional field, never an empty string', () => {
      fill({ fullName: '  Nguyễn Văn A  ', email: 'an@example.test' });

      const request = toCreateRequest(form);
      expect(request.fullName).toBe('Nguyễn Văn A');
      expect(request.phone).toBeNull();
      expect(request.dateOfBirth).toBeNull();
      expect(request.address).toBeNull();
      expect(request.tags).toEqual([]);
    });

    it('uppercases the country, because the contract wants the code', () => {
      fill({ address: { line1: '1 Lê Lợi', city: 'Hà Nội', country: 'vn' } });
      expect(toCreateRequest(form).address?.country).toBe('VN');
    });
  });

  describe('the update payload', () => {
    it('carries only what changed, plus the version', () => {
      const customer = aCustomer();
      form.reset(toFormValue(customer));
      fill({ fullName: 'Nguyễn Văn B' });

      const patch = toUpdateRequest(customer, form, customer.version);

      // A full PUT would overwrite fields this form never showed with values
      // it read minutes ago - which is exactly the edit optimistic
      // concurrency exists to protect.
      expect(patch).toEqual({ fullName: 'Nguyễn Văn B', version: customer.version });
    });

    it('is empty when the user changed nothing', () => {
      const customer = aCustomer();
      form.reset(toFormValue(customer));

      const patch = toUpdateRequest(customer, form, customer.version);
      expect(isEmptyPatch(patch)).toBe(true);
    });

    it('states a newer version without widening what it sends', () => {
      // The conflict-reload case: the form was filled from `baseline`, a
      // colleague has since changed a different field, and the client now
      // knows a newer version. Only this user's change may travel - measuring
      // against the newer record would carry the colleague's field back as
      // this user's old value and undo their work.
      const baseline = aCustomer({ phone: '+84900000000' });
      form.reset(toFormValue(baseline));
      fill({ fullName: 'Nguyễn Văn B' });

      const patch = toUpdateRequest(baseline, form, 9);

      expect(patch).toEqual({ fullName: 'Nguyễn Văn B', version: 9 });
      expect(patch.phone).toBeUndefined();
    });

    it('notices a tag being removed', () => {
      const customer = aCustomer({ tags: ['vip', 'key account'] });
      form.reset(toFormValue(customer));
      fill({ tags: 'vip' });

      expect(toUpdateRequest(customer, form, customer.version).tags).toEqual(['vip']);
    });

    it('notices an address being cleared', () => {
      const customer = aCustomer();
      form.reset(toFormValue(customer));
      fill({ address: { line1: '', line2: '', city: '', postalCode: '', country: '' } });

      expect(toUpdateRequest(customer, form, customer.version).address).toBeNull();
    });
  });

  describe('round tripping', () => {
    it('fills from a customer and produces the same values back', () => {
      const customer = aCustomer();
      form.reset(toFormValue(customer));

      const request = toCreateRequest(form);
      expect(request.fullName).toBe(customer.fullName);
      expect(request.email).toBe(customer.email);
      expect(request.dateOfBirth).toBe(customer.dateOfBirth);
      expect(request.tags).toEqual(customer.tags);
      expect(request.address).toEqual(customer.address);
    });
  });
});
