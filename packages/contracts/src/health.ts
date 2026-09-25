import * as z from 'zod';

/**
 * Liveness endpoint.
 *
 * Part of the contract rather than a mock-only extra: a deployed backend has
 * one too, and the application is allowed to depend on its shape. The
 * `/api/_mock/*` routes are the things that exist only in the mock, and they
 * are deliberately absent from this package.
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  /** How many customers the dataset currently holds. */
  customers: z.int().nonnegative(),
  /** The seed the dataset was generated from, so a run is identifiable. */
  seed: z.int(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
