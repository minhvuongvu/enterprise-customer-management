import { z } from 'zod';
import { customerIdSchema, instantSchema } from './primitives.js';

/**
 * File upload, CSV import and export.
 *
 * The shapes here exist so Phase 4 has a contract to build its UX against. What
 * the mock API implements today is the transport and the validation; the
 * multi-step preview/confirm flow is Phase 4's.
 */

/** What the server accepts as an avatar. The client mirrors these limits for UX. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const avatarUploadResponseSchema = z.object({
  customerId: customerIdSchema,
  avatarUrl: z.string(),
  sizeBytes: z.int().nonnegative(),
  contentType: z.string(),
});
export type AvatarUploadResponse = z.infer<typeof avatarUploadResponseSchema>;

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;

/** Columns a CSV import must provide, in any order. */
export const IMPORT_REQUIRED_COLUMNS = ['fullName', 'email'] as const;
export const IMPORT_OPTIONAL_COLUMNS = [
  'phone',
  'dateOfBirth',
  'gender',
  'status',
  'tags',
] as const;

export const importRowErrorSchema = z.object({
  /** 1-based, counting the header as row 1, so it matches what a spreadsheet shows. */
  row: z.int().min(1),
  column: z.string().nullable(),
  code: z.enum(['REQUIRED', 'INVALID_FORMAT', 'DUPLICATE_EMAIL', 'UNKNOWN_COLUMN', 'TOO_LONG']),
  message: z.string(),
});
export type ImportRowError = z.infer<typeof importRowErrorSchema>;

/**
 * Import outcome.
 *
 * Partial success is a first-class result, not an error: 4,900 good rows should
 * not be thrown away because 100 were bad. The response is 200 with failures
 * listed, and the client decides how to present it.
 */
export const importResultSchema = z.object({
  totalRows: z.int().nonnegative(),
  succeeded: z.int().nonnegative(),
  failed: z.int().nonnegative(),
  errors: z.array(importRowErrorSchema),
  /** True when `errors` was truncated; the full list is too large to return. */
  errorsTruncated: z.boolean(),
  completedAt: instantSchema,
});
export type ImportResult = z.infer<typeof importResultSchema>;

export const exportFormatSchema = z.enum(['csv']);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const exportRequestSchema = z.strictObject({
  format: exportFormatSchema.default('csv'),
  /** Same filters as the list, so "export what I am looking at" is possible. */
  search: z.string().max(100).optional(),
  status: z.string().max(20).optional(),
});
export type ExportRequest = z.infer<typeof exportRequestSchema>;
