import {
  customerSortFieldSchema,
  customerStatusSchema,
  DEFAULT_PAGE_SIZE,
  genderSchema,
  MAX_PAGE_SIZE,
  sortDirectionSchema,
  type CustomerStatus,
  type Gender,
} from '@ecm/contracts';

/**
 * What the customer list is currently showing, as a normalised value.
 *
 * This is the single shape that the URL, the filter controls, the cache key and
 * the outgoing request all agree on. Without it each of the four grows its own
 * slightly different idea of "no status filter" - `undefined`, `null`, `''`,
 * `'ALL'` - and the cache starts missing on queries that are actually equal.
 *
 * Absent values are the empty string rather than `undefined`, because that is
 * what an unset `<select>` and an empty text field produce. Converting to
 * "omit the parameter" happens once, at each of the two edges: writing the URL
 * and building the request.
 */
export interface CustomerListCriteria {
  /** 1-based, as in the URL and in the API. */
  readonly page: number;
  readonly size: number;
  /** `field,direction`, the spelling the URL and the API both use. */
  readonly sort: string;
  readonly search: string;
  readonly status: CustomerStatus | '';
  readonly gender: Gender | '';
  /** Inclusive calendar-date bounds over `createdAt`. */
  readonly createdFrom: string;
  readonly createdTo: string;
}

/**
 * What `/customers` with no query string means.
 *
 * Newest first, because a list of 50,000 records ordered by name has nothing
 * useful on the first page.
 */
export const DEFAULT_CRITERIA: CustomerListCriteria = {
  page: 1,
  size: DEFAULT_PAGE_SIZE,
  sort: 'updatedAt,desc',
  search: '',
  status: '',
  gender: '',
  createdFrom: '',
  createdTo: '',
};

/** Page sizes the size control offers. The API caps at `MAX_PAGE_SIZE`. */
export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50, 100];

/** The raw query string, as component inputs deliver it. */
export type RawCriteria = Partial<Record<keyof CustomerListCriteria, string | number>>;

/**
 * Reads criteria out of the URL, falling back rather than failing.
 *
 * A query string is user input: it is typed by hand, edited in a bookmark, and
 * truncated by chat clients. Every value is therefore validated against the
 * contract's own schemas, and anything that does not pass is replaced with the
 * default instead of being forwarded to the server. A hand-edited
 * `?status=DELETED` must render the unfiltered list, not a 422.
 */
export function readCriteria(raw: RawCriteria): CustomerListCriteria {
  return {
    page: positiveInteger(raw.page, DEFAULT_CRITERIA.page),
    size: clampedSize(raw.size),
    sort: validSort(raw.sort),
    search: text(raw.search).slice(0, 100),
    status: member(customerStatusSchema.options, raw.status),
    gender: member(genderSchema.options, raw.gender),
    createdFrom: calendarDate(raw.createdFrom),
    createdTo: calendarDate(raw.createdTo),
  };
}

/**
 * The query parameters that express these criteria.
 *
 * Values equal to the default are omitted, so `/customers` stays `/customers`
 * rather than becoming a URL with eight parameters that all say "unchanged".
 * A short URL is not cosmetic: it is the one a person will actually paste into
 * a message, and it keeps the back button's history readable.
 *
 * `null` means "remove this parameter" to the router, which is what makes
 * resetting a filter a real removal rather than `?status=`.
 */
export function criteriaToQueryParams(
  criteria: CustomerListCriteria,
): Record<string, string | number | null> {
  return {
    page: orNull(criteria.page, DEFAULT_CRITERIA.page),
    size: orNull(criteria.size, DEFAULT_CRITERIA.size),
    sort: orNull(criteria.sort, DEFAULT_CRITERIA.sort),
    search: orNull(criteria.search, DEFAULT_CRITERIA.search),
    status: orNull(criteria.status, DEFAULT_CRITERIA.status),
    gender: orNull(criteria.gender, DEFAULT_CRITERIA.gender),
    createdFrom: orNull(criteria.createdFrom, DEFAULT_CRITERIA.createdFrom),
    createdTo: orNull(criteria.createdTo, DEFAULT_CRITERIA.createdTo),
  };
}

/**
 * The cache key for a set of criteria.
 *
 * Built from the normalised value in a fixed field order, so two URLs that
 * differ only in parameter order or in omitted defaults produce the same key.
 * That is the whole point of normalising first: a cache keyed by the raw query
 * string would miss on `?size=20&page=2` versus `?page=2&size=20`.
 */
export function criteriaKey(criteria: CustomerListCriteria): string {
  return [
    criteria.page,
    criteria.size,
    criteria.sort,
    criteria.search,
    criteria.status,
    criteria.gender,
    criteria.createdFrom,
    criteria.createdTo,
  ].join('|');
}

/** True when nothing is filtering the list - used to word the empty state. */
export function hasActiveFilters(criteria: CustomerListCriteria): boolean {
  return Boolean(
    criteria.search ||
    criteria.status ||
    criteria.gender ||
    criteria.createdFrom ||
    criteria.createdTo,
  );
}

/**
 * Applies a change and returns to page 1.
 *
 * Every filter change resets the page, and forgetting it is the classic list
 * bug: a user on page 7 types a search term, gets page 7 of three pages of
 * results, and sees an empty list that looks like "no matches".
 */
export function withFilterChange(
  criteria: CustomerListCriteria,
  change: Partial<CustomerListCriteria>,
): CustomerListCriteria {
  return { ...criteria, ...change, page: 1 };
}

// --------------------------------------------------------------- validation

function text(value: string | number | undefined): string {
  return typeof value === 'number' ? String(value) : (value ?? '').trim();
}

function positiveInteger(value: string | number | undefined, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(text(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clampedSize(value: string | number | undefined): number {
  const parsed = positiveInteger(value, DEFAULT_CRITERIA.size);
  // Clamped rather than rejected: `?size=1000` is a reasonable thing to try,
  // and the useful answer is the largest page the API will serve.
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function validSort(value: string | number | undefined): string {
  const [field, direction] = text(value).split(',');
  const fieldOk = customerSortFieldSchema.safeParse(field).success;
  const directionOk = sortDirectionSchema.safeParse(direction).success;
  // Both halves must be valid. Half-correcting a sort parameter produces an
  // order the user did not ask for and cannot see is wrong.
  return fieldOk && directionOk ? `${field},${direction}` : DEFAULT_CRITERIA.sort;
}

function member<T extends string>(
  options: readonly T[],
  value: string | number | undefined,
): T | '' {
  const candidate = text(value);
  return options.includes(candidate as T) ? (candidate as T) : '';
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function calendarDate(value: string | number | undefined): string {
  const candidate = text(value);
  return CALENDAR_DATE.test(candidate) ? candidate : '';
}

function orNull<T extends string | number>(value: T, fallback: T): T | null {
  return value === fallback ? null : value;
}
