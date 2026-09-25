import * as z from 'zod';
import {
  customerIdSchema,
  dateOnlySchema,
  instantSchema,
  userIdSchema,
  versionSchema,
} from './primitives.js';
import { pageRequestSchema, sortParamSchema } from './pagination.js';

/**
 * The customer resource.
 *
 * The domain is deliberately small. What it has to be is *realistic enough to
 * expose frontend problems*: a nested object (address), a list (tags), an
 * optional file reference (avatar), two different kinds of date, and a version
 * for concurrency.
 */

export const customerStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'PROSPECT']);
export type CustomerStatus = z.infer<typeof customerStatusSchema>;

export const genderSchema = z.enum(['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED']);
export type Gender = z.infer<typeof genderSchema>;

export const addressSchema = z.object({
  line1: z.string().max(200),
  line2: z.string().max(200).nullable(),
  city: z.string().max(100),
  postalCode: z.string().max(20).nullable(),
  /** ISO 3166-1 alpha-2. */
  country: z.string().length(2),
});
export type Address = z.infer<typeof addressSchema>;

/**
 * Human-readable business key (`C-000123`).
 *
 * Distinct from `id`: the id is the system's handle, the code is what a person
 * reads out over the phone. Enterprise systems almost always have both, and
 * conflating them is a migration people regret.
 */
export const customerCodeSchema = z.string().regex(/^C-\d{6}$/);
export type CustomerCode = z.infer<typeof customerCodeSchema>;

export const customerSchema = z.object({
  id: customerIdSchema,
  customerCode: customerCodeSchema,
  fullName: z.string().min(1).max(150),
  email: z.email().max(254),
  phone: z.string().max(32).nullable(),
  dateOfBirth: dateOnlySchema.nullable(),
  gender: genderSchema,
  status: customerStatusSchema,
  address: addressSchema.nullable(),
  avatarUrl: z.string().max(500).nullable(),
  tags: z.array(z.string().min(1).max(40)).max(20),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  createdBy: userIdSchema,
  updatedBy: userIdSchema,
  /** Optimistic-concurrency token. See docs/mock-backend.md. */
  version: versionSchema,
});
export type Customer = z.infer<typeof customerSchema>;

/**
 * Create payload.
 *
 * Everything the server owns is absent: id, code, timestamps, actors, version.
 * A client that could set `createdBy` could forge an audit trail.
 */
export const createCustomerRequestSchema = z.strictObject({
  fullName: z.string().min(1).max(150),
  email: z.email().max(254),
  phone: z.string().max(32).nullable().default(null),
  dateOfBirth: dateOnlySchema.nullable().default(null),
  gender: genderSchema.default('UNSPECIFIED'),
  status: customerStatusSchema.default('PROSPECT'),
  address: addressSchema.nullable().default(null),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
});
export type CreateCustomerRequest = z.infer<typeof createCustomerRequestSchema>;

/**
 * Update payload - a partial, plus the version the client last saw.
 *
 * `version` is required: an update that does not say what it is based on cannot
 * be checked for staleness, and silently overwriting a colleague's edit is the
 * failure this whole mechanism exists to prevent.
 */
export const updateCustomerRequestSchema = z.strictObject({
  fullName: z.string().min(1).max(150).optional(),
  email: z.email().max(254).optional(),
  phone: z.string().max(32).nullable().optional(),
  dateOfBirth: dateOnlySchema.nullable().optional(),
  gender: genderSchema.optional(),
  status: customerStatusSchema.optional(),
  address: addressSchema.nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  version: versionSchema,
});
export type UpdateCustomerRequest = z.infer<typeof updateCustomerRequestSchema>;

/** Fields the list may be sorted by. A free-form field name is an injection. */
export const customerSortFieldSchema = z.enum([
  'fullName',
  'email',
  'customerCode',
  'status',
  'createdAt',
  'updatedAt',
]);
export type CustomerSortField = z.infer<typeof customerSortFieldSchema>;

export const customerListQuerySchema = pageRequestSchema.extend({
  sort: sortParamSchema.default('updatedAt,desc'),
  search: z.string().max(100).optional(),
  status: customerStatusSchema.optional(),
  gender: genderSchema.optional(),
  /** Inclusive range over `createdAt`, as calendar dates. */
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
});
export type CustomerListQuery = z.input<typeof customerListQuerySchema>;
export type ParsedCustomerListQuery = z.output<typeof customerListQuerySchema>;

/** Bulk operations. Partial success is the normal case, not the edge case. */
export const bulkActionSchema = z.enum(['ACTIVATE', 'DEACTIVATE', 'DELETE']);
export type BulkAction = z.infer<typeof bulkActionSchema>;

export const bulkRequestSchema = z.strictObject({
  action: bulkActionSchema,
  ids: z.array(customerIdSchema).min(1).max(200),
});
export type BulkRequest = z.infer<typeof bulkRequestSchema>;

export const bulkItemResultSchema = z.object({
  id: customerIdSchema,
  outcome: z.enum(['SUCCEEDED', 'FAILED']),
  /** Present when the outcome is FAILED. Machine-readable, as everywhere. */
  errorCode: z.enum(['NOT_FOUND', 'FORBIDDEN', 'CONFLICT', 'INTERNAL_ERROR']).optional(),
});
export type BulkItemResult = z.infer<typeof bulkItemResultSchema>;

export const bulkResponseSchema = z.object({
  requested: z.int().nonnegative(),
  succeeded: z.int().nonnegative(),
  failed: z.int().nonnegative(),
  results: z.array(bulkItemResultSchema),
});
export type BulkResponse = z.infer<typeof bulkResponseSchema>;
