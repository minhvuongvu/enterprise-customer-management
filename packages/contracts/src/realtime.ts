import * as z from 'zod';
import { customerCodeSchema } from './customer.js';
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
 *
 * Customer events carry the `customerCode` since Phase 4, so a client can say
 * "Customer C-000001 was updated by another user" without fetching the record
 * first - and without being told anything the recipient could not already read.
 */

export const realtimeEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('customer.created'),
    id: z.string(),
    at: instantSchema,
    customerId: customerIdSchema,
    customerCode: customerCodeSchema,
    actorId: userIdSchema,
  }),
  z.object({
    type: z.literal('customer.updated'),
    id: z.string(),
    at: instantSchema,
    customerId: customerIdSchema,
    customerCode: customerCodeSchema,
    actorId: userIdSchema,
    /** Lets a client decide whether the change touches what it is showing. */
    changedFields: z.array(z.string()),
  }),
  z.object({
    type: z.literal('customer.deleted'),
    id: z.string(),
    at: instantSchema,
    customerId: customerIdSchema,
    customerCode: customerCodeSchema,
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

/** Name of the event-stream header the browser sends when it reconnects. */
export const LAST_EVENT_ID_HEADER = 'last-event-id';
/**
 * The same value as a query parameter. A client that opens a *new* EventSource
 * (rather than letting the browser reconnect the old one) cannot set headers,
 * so this is how it asks for what it missed.
 */
export const LAST_EVENT_ID_PARAM = 'lastEventId';

/** Every event type, for a client that must subscribe to named events one by one. */
export const REALTIME_EVENT_TYPES: readonly RealtimeEventType[] = [
  'customer.created',
  'customer.updated',
  'customer.deleted',
  'import.completed',
  'system.notice',
];

/**
 * Sent instead of a replay when the server cannot say what a reconnecting
 * client missed. An event, not an SSE comment: a browser's EventSource never
 * shows comments to the page. It carries no id and no data worth reading - its
 * arrival is the message: "revalidate what you are showing".
 */
export const RESYNC_EVENT = 'resync';
