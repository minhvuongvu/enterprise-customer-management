import * as z from 'zod';
import { customerIdSchema, instantSchema, userIdSchema } from './primitives.js';

/**
 * Audit trail for a customer.
 *
 * Changes are recorded per field, with before and after values, because "the
 * record was updated" answers nothing. The values are strings: an audit entry
 * is a rendering of what happened, not a typed snapshot to reconstruct state
 * from.
 *
 * Sensitive fields are omitted by the server rather than sent and hidden by the
 * client (ANGULAR_PROJECT_CONTEXT.md 3.13).
 */

export const auditActionSchema = z.enum([
  'CUSTOMER_CREATED',
  'CUSTOMER_UPDATED',
  'CUSTOMER_DELETED',
  'CUSTOMER_STATUS_CHANGED',
  'CUSTOMER_IMPORTED',
]);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditFieldChangeSchema = z.object({
  field: z.string(),
  previousValue: z.string().nullable(),
  newValue: z.string().nullable(),
  /**
   * True when the server withheld both values because the field is sensitive.
   * The trail still says *that* it changed, which is what an audit is for;
   * *what it was* is not something every reader of the trail needs.
   */
  redacted: z.boolean().default(false),
});

/**
 * Fields whose values never appear in an audit entry. A date of birth is
 * personal data that identifies someone; knowing it changed is useful,
 * knowing the old one is not. Decided by the server, shared so the client can
 * explain the gap rather than render an empty cell.
 */
export const AUDIT_REDACTED_FIELDS = ['dateOfBirth'] as const;
export type AuditFieldChange = z.infer<typeof auditFieldChangeSchema>;

export const auditEntrySchema = z.object({
  id: z.uuid(),
  customerId: customerIdSchema,
  action: auditActionSchema,
  occurredAt: instantSchema,
  actorId: userIdSchema,
  /** Denormalised so the list renders without a second request per row. */
  actorDisplayName: z.string(),
  changes: z.array(auditFieldChangeSchema),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

/**
 * The audit endpoint's envelope.
 *
 * An object rather than a bare array, for the same reason the customer list is
 * one: an array response has nowhere to put paging or a total when the trail
 * grows past a screenful, and changing the shape later breaks every client.
 *
 * It is here rather than inferred on either side because until Phase 2 read it,
 * the mock API was the only definition of this shape - which is precisely the
 * second, hand-written copy this package exists to prevent.
 */
export const auditListResponseSchema = z.object({
  items: z.array(auditEntrySchema),
});
export type AuditListResponse = z.infer<typeof auditListResponseSchema>;
