import { z } from 'zod';
import type { FieldIssue } from '@ecm/contracts';
import { ApiError } from './api-error.ts';

/**
 * Validates input at the edge and converts a Zod failure into the API's
 * validation error.
 *
 * Every request body and query string goes through here. Past this point a
 * handler works with parsed, typed data and never re-checks anything - which
 * is the reason the schemas live in `@ecm/contracts` rather than being
 * re-implemented as `if (!body.email)` in each route.
 *
 * Issues are grouped by their dotted path rather than by `flattenError`,
 * because the payload has nested objects: a bad `address.city` must be
 * reportable as `address.city`, not collapsed onto `address` or dropped.
 * Issues with no path - an unknown key, a failed cross-field rule - are
 * collected under `_`, so a 422 is never returned with an empty body.
 *
 * Each issue is reported twice, on purpose: as Zod's developer sentence in
 * `fieldErrors`, for logs, and as a `FieldIssue` code in `fieldIssues`, which
 * a client can translate (Phase 6, debt row 12).
 */
export function parseOrThrow<Schema extends z.ZodType>(
  schema: Schema,
  data: unknown,
  what: string,
): z.output<Schema> {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  const fieldErrors: Record<string, string[]> = {};
  const fieldIssues: Record<string, FieldIssue[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '_';
    (fieldErrors[key] ??= []).push(issue.message);
    (fieldIssues[key] ??= []).push(toFieldIssue(issue, valueAt(data, issue.path)));
  }

  throw new ApiError('VALIDATION_FAILED', `Invalid ${what}.`, { fieldErrors, fieldIssues });
}

/**
 * Zod's issue, reduced to the API's vocabulary.
 *
 * "Required" is decided from the input rather than from the issue type: Zod
 * reports a missing string as a type error and an empty one as a length
 * error, and a user should be told the same thing about both - fill this in.
 */
export function toFieldIssue(issue: z.core.$ZodIssue, value: unknown): FieldIssue {
  if (issue.code === 'unrecognized_keys') {
    return { code: 'UNKNOWN_FIELD' };
  }
  if (value === undefined || value === null) {
    return { code: 'REQUIRED' };
  }
  // An exact length (`country` is two letters) is a format, not a bound: "use
  // 2 characters or fewer" would be wrong advice for "V".
  if ((issue.code === 'too_small' || issue.code === 'too_big') && issue.exact) {
    return { code: 'INVALID_FORMAT' };
  }
  switch (issue.code) {
    case 'too_small':
      return value === '' || (Array.isArray(value) && value.length === 0)
        ? { code: 'REQUIRED' }
        : { code: 'INVALID_VALUE' };
    case 'too_big':
      if (issue.origin === 'array' || issue.origin === 'set') {
        return { code: 'TOO_MANY', limit: Number(issue.maximum) };
      }
      return issue.origin === 'string'
        ? { code: 'TOO_LONG', limit: Number(issue.maximum) }
        : { code: 'INVALID_VALUE' };
    case 'invalid_format':
      return { code: 'INVALID_FORMAT' };
    default:
      return { code: 'INVALID_VALUE' };
  }
}

/** The input value an issue's path points at, or `undefined`. */
function valueAt(data: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = data;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<PropertyKey, unknown>)[segment];
  }
  return current;
}
