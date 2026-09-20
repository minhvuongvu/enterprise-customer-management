import type { DateOnly, Instant } from '@ecm/contracts';

/**
 * Time policy, encoded once.
 *
 * Two different things get called "a date" in this domain and conflating them
 * is the classic enterprise bug:
 *
 *  - An **Instant** is a moment in time (`createdAt`, `updatedAt`). It is always
 *    stored and transported as UTC ISO-8601 and converted to the viewer's zone
 *    only at render time.
 *  - A **DateOnly** is a calendar date with no time and no zone (`dateOfBirth`).
 *    It must never be turned into a `Date` for display: a birthday in Hanoi is
 *    the same birthday in London, and `new Date('1990-01-01')` in a negative
 *    offset silently makes it 1989-12-31.
 *
 * The **types** are defined in `@ecm/contracts`, because they describe what
 * crosses the wire and the mock API has to agree about them. The **operations**
 * are here, because formatting and "now" are application concerns that no API
 * contract should carry. Re-exported so feature code has one import for both.
 */
export type { DateOnly, Instant } from '@ecm/contracts';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The current moment. The only sanctioned way to read "now" as an Instant. */
export function now(): Instant {
  return new Date().toISOString() as Instant;
}

/** Converts a `Date` to its UTC representation. */
export function toInstant(value: Date): Instant {
  return value.toISOString() as Instant;
}

/**
 * Validates a string received from the network.
 *
 * Returns `null` rather than throwing: a malformed timestamp from the API is a
 * data problem for the caller to map into the error taxonomy, not a crash.
 */
export function parseInstant(value: string): Instant | null {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  // Round-tripping normalises `+00:00`, missing milliseconds and other legal
  // spellings into the single canonical form the application works with.
  return new Date(parsed).toISOString() as Instant;
}

/** Converts an Instant to a `Date` for formatting. Render time only. */
export function instantToDate(value: Instant): Date {
  return new Date(value);
}

/**
 * Validates a calendar date.
 *
 * Checks the calendar as well as the shape, so `2026-02-30` is rejected instead
 * of rolling over into March.
 */
export function parseDateOnly(value: string): DateOnly | null {
  if (!DATE_ONLY_PATTERN.test(value)) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  const roundTripped =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;
  return roundTripped ? (value as DateOnly) : null;
}

/**
 * Splits a calendar date into its parts.
 *
 * This is the only supported way to render a DateOnly: hand the parts to a
 * locale-aware formatter. Do not build a `Date` from it.
 */
export function dateOnlyParts(value: DateOnly): { year: number; month: number; day: number } {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

/**
 * Renders a calendar date in the viewer's language, without moving it.
 *
 * This is the "hand the parts to a locale-aware formatter" step the note above
 * describes, written once so no caller has to get it right. The two halves that
 * make it safe are easy to lose if it is reimplemented in a template:
 *
 *  - the `Date` is built from `Date.UTC`, so the parts land on the day they
 *    say rather than on the previous evening in a negative offset;
 *  - the formatter is pinned to UTC, so it reads them back the same way.
 *
 * Together they mean a birthday reads identically in Hanoi and in Los Angeles,
 * which is the whole reason `DateOnly` is a separate type.
 */
export function formatDateOnly(value: DateOnly, locale: string): string {
  const { year, month, day } = dateOnlyParts(value);
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
