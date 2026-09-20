import { customerIdSchema, type CustomerId } from '@ecm/contracts';

/**
 * Turns a route parameter into an identifier the API will accept.
 *
 * A `:id` segment is a string that a user typed, a bookmark preserved or a
 * chat client truncated. Validating it here means `/customers/not-a-uuid`
 * renders "not found" immediately instead of making a request that was always
 * going to fail, and it is what lets everything downstream take a `CustomerId`
 * rather than a `string` that might be one.
 */
export function parseCustomerId(raw: string | undefined): CustomerId | null {
  const parsed = customerIdSchema.safeParse(raw ?? '');
  return parsed.success ? parsed.data : null;
}
