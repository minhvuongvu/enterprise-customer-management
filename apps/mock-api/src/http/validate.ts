import { z } from 'zod';
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
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '_';
    const existing = fieldErrors[key];
    if (existing) {
      existing.push(issue.message);
    } else {
      fieldErrors[key] = [issue.message];
    }
  }

  throw new ApiError('VALIDATION_FAILED', `Invalid ${what}.`, { fieldErrors });
}
