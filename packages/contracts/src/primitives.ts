import * as z from 'zod';

/**
 * Wire-format primitives shared by the application and the mock API.
 *
 * These are branded, so the compiler stops a raw string from being used where a
 * validated value is required, and stops the two kinds of "date" from being
 * mixed up. The operations over them live in the application
 * (`apps/web/src/app/core/time`); this package owns only what goes on the wire.
 */

/**
 * A moment in time, always UTC ISO-8601 (`2026-09-20T04:15:00.000Z`).
 *
 * `offset: false` rejects `+07:00` spellings on the wire. One representation
 * crossing the boundary means no code has to normalise before comparing.
 */
export const instantSchema = z.iso.datetime({ offset: false }).brand<'Instant'>();
export type Instant = z.infer<typeof instantSchema>;

/**
 * A calendar date with no time and no timezone (`1990-01-01`).
 *
 * Separate from Instant because it must never be converted through a `Date`:
 * a birthday does not move when the viewer does. See core/time for why.
 */
export const dateOnlySchema = z.iso.date().brand<'DateOnly'>();
export type DateOnly = z.infer<typeof dateOnlySchema>;

/** Identifier of a customer. */
export const customerIdSchema = z.uuid().brand<'CustomerId'>();
export type CustomerId = z.infer<typeof customerIdSchema>;

/** Identifier of a user - an actor in the audit log, or the current session. */
export const userIdSchema = z.uuid().brand<'UserId'>();
export type UserId = z.infer<typeof userIdSchema>;

/**
 * Optimistic-concurrency token.
 *
 * Incremented by the server on every write. A client that submits a stale
 * version gets a 409 instead of silently overwriting someone else's edit.
 */
export const versionSchema = z.int().nonnegative();
export type Version = z.infer<typeof versionSchema>;

/** Ties a request, its response and both sides' log lines together. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';
