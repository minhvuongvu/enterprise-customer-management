import {
  customerStatusSchema,
  genderSchema,
  type CustomerStatus,
  type Gender,
} from '@ecm/contracts';
import type { BadgeTone } from '../shared/ui/badge/badge';
import type { SelectOption } from '../shared/ui/select/select';

/**
 * How the customer domain's enumerations are said and shown.
 *
 * It lives in the feature, not in `shared/ui`, because it is business
 * vocabulary: a component that knows `PROSPECT` is amber knows what a customer
 * is, which rule 1 of the shared-UI README forbids.
 *
 * Two rules are encoded here rather than repeated per template:
 *
 *  - a status is never written as text in a template. It arrives from the API
 *    as a machine value and is rendered through a translation key, so the day
 *    a second language exists nothing has to be found and extracted.
 *  - a tone is named by meaning. `PROSPECT` is `warning` because it is
 *    unresolved, not because amber looked nice; a redesign that changes what
 *    amber means does not have to revisit this file.
 */

export const CUSTOMER_STATUSES: readonly CustomerStatus[] = customerStatusSchema.options;
export const GENDERS: readonly Gender[] = genderSchema.options;

/** Translation key for a status. Keys are the machine values, uppercased. */
export function statusLabelKey(status: CustomerStatus): string {
  return `customers.status.${status}`;
}

export function genderLabelKey(gender: Gender): string {
  return `customers.gender.${gender}`;
}

/**
 * Badge tone per status.
 *
 * Colour never carries the meaning on its own - the badge always shows the
 * word as well - so this is emphasis, not information.
 */
export function statusTone(status: CustomerStatus): BadgeTone {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'INACTIVE':
      return 'neutral';
    case 'PROSPECT':
      return 'warning';
  }
}

/** Translation key for a bulk item's failure code. */
export function bulkFailureKey(code: string | undefined): string {
  return `customers.bulk.failure.${code ?? 'INTERNAL_ERROR'}`;
}

/**
 * Turns an enumeration into options for a `<app-select>`.
 *
 * `translate` is passed in rather than injected so this file stays a pure
 * description of the vocabulary, and so the caller decides which language it
 * is asking for - which is what makes the options recompute when the language
 * changes instead of keeping whichever was active when they were first built.
 */
export function toSelectOptions<T extends string>(
  values: readonly T[],
  keyFor: (value: T) => string,
  translate: (key: string) => string,
): SelectOption[] {
  return values.map((value) => ({ value, label: translate(keyFor(value)) }));
}
