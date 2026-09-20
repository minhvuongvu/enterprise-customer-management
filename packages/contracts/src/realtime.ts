import { z } from 'zod';
import { customerIdSchema, instantSchema, userIdSchema } from './primitives.js';

/**
 * Server-sent events.
 *
 * SSE rather than WebSocket: every event in this application travels from
 * server to client, and none travels back. SSE gets automatic reconnection and
 * event ids from the browser for free, survives proxies that mangle upgrades,
 * and needs no second protocol to reason about. Phase 4 revisits this if a
 * genuine client-to-server channel appears. See ADR-0006.
 *
 * Each event carries an `id`, so a client that reconnects can discard events it
 * already applied. Duplicate delivery is normal with SSE, not a bug to fix.
 */

export const realtimeEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('customer.created'),
    id: z.string(),
    at: instantSchema,
    customerId: customerIdSchema,
    actorId: userIdSchema,
  }),
  z.object({
    type: z.literal('customer.updated'),
    id: z.string(),
    at: instantSchema,
    customerId: customerIdSchema,
    actorId: userIdSchema,
    /** Lets a client decide whether the change touches what it is showing. */
    changedFields: z.array(z.string()),
  }),
  z.object({
    type: z.literal('customer.deleted'),
    id: z.string(),
    at: instantSchema,
    customerId: customerIdSchema,
    actorId: userIdSchema,
  }),
  z.object({
    type: z.literal('import.completed'),
    id: z.string(),
    at: instantSchema,
    actorId: userIdSchema,
    succeeded: z.int().nonnegative(),
    failed: z.int().nonnegative(),
  }),
  z.object({
    type: z.literal('system.notice'),
    id: z.string(),
    at: instantSchema,
    /** A translation key, not a sentence - same rule as everywhere else. */
    messageKey: z.string(),
  }),
]);
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export type RealtimeEventType = RealtimeEvent['type'];
