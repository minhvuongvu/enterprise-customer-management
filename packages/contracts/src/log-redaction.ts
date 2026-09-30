/**
 * What may never be written to a log - on either side of the wire.
 *
 * The browser and the mock API both log requests about the same resources, so
 * both must agree on which fields are secret or personal. One list, here, next
 * to the schemas that define those fields: when a personal field is added to
 * `customerSchema`, this is the file a reviewer expects to change with it, and
 * a second copy in each app is the copy that would be forgotten (ADR-0038).
 *
 * Two layers, because each catches what the other misses:
 *
 *  1. **By key.** A field whose name says what it is (`password`,
 *     `accessToken`, `email`) is replaced, whatever its value looks like.
 *  2. **By value.** A string that *looks* like a credential or an email address
 *     is masked wherever it appears - including inside a free-text message or
 *     an error's text, where no key names it. `Error: duplicate key
 *     an@example.test` is the classic leak.
 *
 * Redaction is a safety net under the rule that call sites log identifiers
 * (a customer id, a correlation id) and never the record itself. It is not a
 * licence to log records.
 */

export const REDACTED = '[redacted]';

/**
 * Credential-bearing key fragments. Matched case-insensitively against the key
 * with `_` and `-` removed, so `accessToken`, `refresh_token` and `X-CSRF-Token`
 * are all one entry.
 */
const SECRET_KEY_PARTS = [
  'password',
  'passwd',
  'token',
  'secret',
  'authorization',
  'apikey',
  'cookie',
  'csrf',
  'session',
  'credential',
] as const;

/**
 * Personal data in this domain (`customerSchema`, `addressSchema`). Exact key
 * names, not fragments: `name` as a fragment would also hide `routeName`.
 * `search` is here because a list search is usually a person's name or email.
 */
const PERSONAL_KEYS = new Set([
  'fullname',
  'displayname',
  'email',
  'phone',
  'dateofbirth',
  'address',
  'line1',
  'line2',
  'postalcode',
  'search',
  'query',
]);

/** `a@b.c` anywhere in a string. Deliberately loose: a false mask costs nothing. */
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
/** Three base64url segments separated by dots - the shape of a JWT. */
const JWT_PATTERN = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
/** `Bearer <anything>` in a header value copied into a message. */
const BEARER_PATTERN = /\bBearer\s+[\w.~+/=-]+/gi;

const MAX_DEPTH = 5;

function normalise(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

/** True when a value stored under this key must never be logged. */
export function isSensitiveLogKey(key: string): boolean {
  const normalised = normalise(key);
  return (
    PERSONAL_KEYS.has(normalised) || SECRET_KEY_PARTS.some((part) => normalised.includes(part))
  );
}

/** Masks credentials and email addresses inside free text. */
export function redactText(text: string): string {
  return text
    .replace(JWT_PATTERN, REDACTED)
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
    .replace(EMAIL_PATTERN, '[email]');
}

/**
 * A copy of `value` that is safe to log.
 *
 * Never mutates its input - the caller's object may be live application state.
 * Survives cycles and very deep objects by cutting them off at `MAX_DEPTH`.
 */
export function redactLogValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return redactText(value);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactLogValue(item, depth + 1));
  }
  if (value instanceof Error) {
    return { name: value.name, message: redactText(value.message) };
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = isSensitiveLogKey(key) ? REDACTED : redactLogValue(item, depth + 1);
  }
  return out;
}

/** `redactLogValue` for the usual case: a record of log fields. */
export function redactLogFields(
  fields: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return redactLogValue(fields) as Record<string, unknown>;
}

const ID_SEGMENT =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|C-\d{6}|\d+)$/i;

/**
 * `http://host/api/customers/6f0c…/audit?page=2` → `/api/customers/:id/audit`.
 *
 * What both logs record instead of a URL: the origin and the query string go
 * (a search is a person's name), and ids and customer codes become `:id`, so
 * latency groups by endpoint and the two sides' lines compare one to one.
 */
export function endpointTemplate(url: string): string {
  const path = url.replace(/^[a-z]+:\/\/[^/]+/i, '').split('?')[0] ?? '';
  return path
    .split('/')
    .map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/');
}
