import { z } from 'zod';
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
});
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
