import * as z from 'zod';

/**
 * Paging, sorting and the list envelope.
 *
 * Query parameters arrive as strings, so the request schemas coerce. That
 * coercion is the boundary: past it, a page number is a number.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const sortDirectionSchema = z.enum(['asc', 'desc']);
export type SortDirection = z.infer<typeof sortDirectionSchema>;

/**
 * Sorting is expressed as `field,direction` in the URL (`updatedAt,desc`),
 * because the URL is the source of truth for list state and that form survives
 * a copy-paste into a colleague's browser.
 */
export const sortParamSchema = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9]*,(asc|desc)$/, 'Expected "field,asc" or "field,desc"');

export function parseSortParam(value: string): { field: string; direction: SortDirection } {
  const [field, direction] = value.split(',');
  return { field, direction: direction as SortDirection };
}

export const pageRequestSchema = z.object({
  /** 1-based: it appears in URLs that people read. */
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PageRequest = z.infer<typeof pageRequestSchema>;

/**
 * The list envelope.
 *
 * `totalItems` is included even though it costs the server a count, because
 * without it a client cannot render "page 3 of 47" - and a list UI that cannot
 * say how much there is teaches the wrong lesson.
 */
export function pageResponseSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.int().min(1),
    size: z.int().min(1),
    totalItems: z.int().nonnegative(),
    totalPages: z.int().nonnegative(),
  });
}

export interface PageResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}
