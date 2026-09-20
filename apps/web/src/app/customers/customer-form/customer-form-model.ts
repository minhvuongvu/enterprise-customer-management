import { FormControl, FormGroup, Validators, type ValidationErrors } from '@angular/forms';
import type {
  Address,
  CreateCustomerRequest,
  Customer,
  CustomerStatus,
  DateOnly,
  Gender,
  UpdateCustomerRequest,
} from '@ecm/contracts';
import { parseDateOnly } from '../../core/time/instant';

/**
 * The customer form's shape, validators and the two conversions at its edges.
 *
 * Separated from the component on purpose. A form's rules are the part worth
 * testing - they are business rules wearing a UI costume - and testing them
 * through a rendered component means every assertion travels through change
 * detection for no reason. Everything here is a pure function or a `FormGroup`
 * factory, so `customer-form-model.spec.ts` reads like a specification.
 *
 * Client-side validation mirrors `@ecm/contracts`, and that duplication is
 * deliberate: the schema cannot tell a user *which field* to fix as they type,
 * and the server still validates everything again because the client is not a
 * security boundary. The two are kept in step by the limits below being read
 * from one place in spirit - and by the server rejecting anything that drifts.
 */

export const MAX_FULL_NAME = 150;
export const MAX_EMAIL = 254;
export const MAX_PHONE = 32;
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;
export const MAX_ADDRESS_LINE = 200;
export const MAX_CITY = 100;
export const MAX_POSTAL_CODE = 20;

/**
 * Deliberately permissive: digits, spaces and the punctuation real phone
 * numbers are written with. A strict national format would reject a legitimate
 * international number, which is the more expensive mistake.
 */
const PHONE_PATTERN = /^[+()\-.\s\d]{5,}$/;
const COUNTRY_PATTERN = /^[A-Za-z]{2}$/;

export interface CustomerAddressControls {
  line1: FormControl<string>;
  line2: FormControl<string>;
  city: FormControl<string>;
  postalCode: FormControl<string>;
  country: FormControl<string>;
}

export interface CustomerFormControls {
  fullName: FormControl<string>;
  email: FormControl<string>;
  phone: FormControl<string>;
  dateOfBirth: FormControl<string>;
  gender: FormControl<Gender>;
  status: FormControl<CustomerStatus>;
  tags: FormControl<string>;
  address: FormGroup<CustomerAddressControls>;
}

export type CustomerForm = FormGroup<CustomerFormControls>;

/**
 * Builds an empty form.
 *
 * Every control is `nonNullable`, so `reset()` returns to the initial value
 * rather than to `null` - which is what makes "reset" mean "back to how it
 * was" for an edit and "empty" for a create, with no branching.
 */
export function createCustomerForm(): CustomerForm {
  return new FormGroup<CustomerFormControls>(
    {
      fullName: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, maxLength(MAX_FULL_NAME)],
      }),
      email: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, emailFormat, maxLength(MAX_EMAIL)],
      }),
      phone: new FormControl('', {
        nonNullable: true,
        validators: [phoneFormat, maxLength(MAX_PHONE)],
      }),
      dateOfBirth: new FormControl('', { nonNullable: true, validators: [birthDate] }),
      gender: new FormControl<Gender>('UNSPECIFIED', { nonNullable: true }),
      status: new FormControl<CustomerStatus>('PROSPECT', { nonNullable: true }),
      tags: new FormControl('', { nonNullable: true, validators: [tagList] }),
      address: new FormGroup<CustomerAddressControls>(
        {
          line1: new FormControl('', {
            nonNullable: true,
            validators: [maxLength(MAX_ADDRESS_LINE)],
          }),
          line2: new FormControl('', {
            nonNullable: true,
            validators: [maxLength(MAX_ADDRESS_LINE)],
          }),
          city: new FormControl('', { nonNullable: true, validators: [maxLength(MAX_CITY)] }),
          postalCode: new FormControl('', {
            nonNullable: true,
            validators: [maxLength(MAX_POSTAL_CODE)],
          }),
          country: new FormControl('', { nonNullable: true, validators: [countryCode] }),
        },
        { validators: [addressCompleteness] },
      ),
    },
    { validators: [phoneRequiredWhenActive] },
  );
}

// ------------------------------------------------------------- validators

function maxLength(max: number) {
  return (control: { value: unknown }): ValidationErrors | null => {
    const value = String(control.value ?? '');
    return value.length > max ? { tooLong: { max } } : null;
  };
}

function emailFormat(control: { value: unknown }): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) {
    return null;
  }
  // One `@`, something either side, and a dot in the domain. Deliberately not
  // an RFC 5322 regular expression: those reject addresses that work and are
  // impossible to read. The server validates properly; this is a typo catcher.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : { invalidEmail: true };
}

function phoneFormat(control: { value: unknown }): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) {
    return null;
  }
  return PHONE_PATTERN.test(value) ? null : { invalidPhone: true };
}

function countryCode(control: { value: unknown }): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) {
    return null;
  }
  return COUNTRY_PATTERN.test(value) ? null : { invalidCountry: true };
}

/**
 * A birthday: a real calendar date, and not in the future.
 *
 * `parseDateOnly` checks the calendar as well as the shape, so 2026-02-30 is
 * rejected rather than quietly rolling into March. The comparison is between
 * two `YYYY-MM-DD` strings, which sorts correctly and - unlike comparing
 * `Date`s - cannot shift a date across midnight in someone's timezone.
 */
function birthDate(control: { value: unknown }): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) {
    return null;
  }
  if (!parseDateOnly(value)) {
    return { invalidDate: true };
  }
  const today = new Date().toISOString().slice(0, 10);
  return value > today ? { futureDate: true } : null;
}

function tagList(control: { value: unknown }): ValidationErrors | null {
  const tags = parseTags(String(control.value ?? ''));
  if (tags.length > MAX_TAGS) {
    return { tooManyTags: { max: MAX_TAGS } };
  }
  if (tags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
    return { tagTooLong: { max: MAX_TAG_LENGTH } };
  }
  return null;
}

/**
 * Cross-field rule: an address is all or nothing.
 *
 * Starting an address and leaving out the city produces a record that cannot
 * be posted to anyone, so the moment any part is filled in, the parts that
 * make it deliverable become required. This is on the group rather than on the
 * controls because no single control can answer the question.
 */
function addressCompleteness(group: {
  value: Partial<Record<keyof CustomerAddressControls, string>>;
}): ValidationErrors | null {
  const value = group.value;
  const entries = Object.values(value).map((field) => (field ?? '').trim());
  if (entries.every((field) => field === '')) {
    return null;
  }

  const missing = (['line1', 'city', 'country'] as const).filter(
    (field) => !(value[field] ?? '').trim(),
  );
  return missing.length ? { addressIncomplete: { fields: missing } } : null;
}

/**
 * Cross-field rule: an active customer has to be reachable.
 *
 * The kind of rule that only exists at the level of the whole record, and the
 * reason a form needs group validators at all. It is checked again on the
 * server - or would be, in a real system; here it is the client's rule, and
 * saying so is better than implying the server enforces it.
 */
function phoneRequiredWhenActive(group: {
  value: { status?: CustomerStatus; phone?: string };
}): ValidationErrors | null {
  const { status, phone } = group.value;
  return status === 'ACTIVE' && !(phone ?? '').trim() ? { phoneRequiredWhenActive: true } : null;
}

// ------------------------------------------------------------ conversions

/** Splits the tag field, trimming and dropping blanks and duplicates. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const tag = part.trim();
    if (tag) {
      seen.add(tag);
    }
  }
  return [...seen];
}

/** The form's value, as the controls hold it: strings, never null. */
export interface CustomerFormValue {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: Gender;
  status: CustomerStatus;
  tags: string;
  address: Record<keyof CustomerAddressControls, string>;
}

/** Fills the form from a customer. The inverse of the two functions below. */
export function toFormValue(customer: Customer): CustomerFormValue {
  return {
    fullName: customer.fullName,
    email: customer.email,
    phone: customer.phone ?? '',
    dateOfBirth: customer.dateOfBirth ?? '',
    gender: customer.gender,
    status: customer.status,
    tags: customer.tags.join(', '),
    address: {
      line1: customer.address?.line1 ?? '',
      line2: customer.address?.line2 ?? '',
      city: customer.address?.city ?? '',
      postalCode: customer.address?.postalCode ?? '',
      country: customer.address?.country ?? '',
    },
  };
}

/** The create payload. Empty optional fields become `null`, never `''`. */
export function toCreateRequest(form: CustomerForm): CreateCustomerRequest {
  const value = form.getRawValue();
  return {
    fullName: value.fullName.trim(),
    email: value.email.trim(),
    phone: blankToNull(value.phone),
    dateOfBirth: value.dateOfBirth ? (value.dateOfBirth as DateOnly) : null,
    gender: value.gender,
    status: value.status,
    address: toAddress(value.address),
    tags: parseTags(value.tags),
  };
}

/**
 * The update payload: only what this user changed, based on a stated version.
 *
 * Two different records are involved, and keeping them apart is the whole
 * point:
 *
 *  - **`baseline`** is the record the form was *filled from*. The difference
 *    between it and the form is, by definition, what this user changed.
 *  - **`version`** comes from the newest record the client knows about, which
 *    after a conflict reload is not the same record at all.
 *
 * Measuring the diff against the newest record instead would be subtly wrong
 * in exactly the case that matters: after reloading from a conflict, every
 * field the *other* person changed now differs from what is in this form, so
 * it would be included in the patch and their work would be overwritten - by
 * a mechanism whose entire purpose is to prevent that.
 *
 * Sending the whole record back has the same fault, permanently. That is why
 * this is a PATCH.
 */
export function toUpdateRequest(
  baseline: Customer,
  form: CustomerForm,
  version: number,
): UpdateCustomerRequest {
  const original = baseline;
  const next = toCreateRequest(form);
  const patch: UpdateCustomerRequest = { version };

  if (next.fullName !== original.fullName) {
    patch.fullName = next.fullName;
  }
  if (next.email !== original.email) {
    patch.email = next.email;
  }
  if (next.phone !== original.phone) {
    patch.phone = next.phone;
  }
  if (next.dateOfBirth !== original.dateOfBirth) {
    patch.dateOfBirth = next.dateOfBirth;
  }
  if (next.gender !== original.gender) {
    patch.gender = next.gender;
  }
  if (next.status !== original.status) {
    patch.status = next.status;
  }
  if (!sameTags(next.tags, original.tags)) {
    patch.tags = next.tags;
  }
  if (!sameAddress(next.address, original.address)) {
    patch.address = next.address;
  }

  return patch;
}

/** True when nothing but the version would be sent. */
export function isEmptyPatch(patch: UpdateCustomerRequest): boolean {
  return Object.keys(patch).length === 1;
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toAddress(value: Record<keyof CustomerAddressControls, string>): Address | null {
  const line1 = value.line1.trim();
  const city = value.city.trim();
  const country = value.country.trim().toUpperCase();
  if (!line1 && !city && !country) {
    return null;
  }
  return {
    line1,
    line2: blankToNull(value.line2),
    city,
    postalCode: blankToNull(value.postalCode),
    country,
  };
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

function sameAddress(a: Address | null, b: Address | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.line1 === b.line1 &&
    a.line2 === b.line2 &&
    a.city === b.city &&
    a.postalCode === b.postalCode &&
    a.country === b.country
  );
}
