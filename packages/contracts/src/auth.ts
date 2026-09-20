import { z } from 'zod';
import { userIdSchema } from './primitives.js';

/**
 * Roles, permissions, and the mapping between them.
 *
 * Permissions are modelled separately from roles because that is the
 * distinction that survives contact with reality: roles are how access is
 * granted, permissions are what the code checks. A feature asks "may this user
 * delete a customer", never "is this user an ADMIN" - so adding a role later
 * does not mean editing every call site.
 *
 * This matrix is shared so the mock API and the application agree on what a
 * role means. It is **not** what makes authorization safe: the server checks
 * the permission on every request regardless of what the client believes.
 */

export const roleSchema = z.enum(['ADMIN', 'MANAGER', 'VIEWER']);
export type Role = z.infer<typeof roleSchema>;

export const permissionSchema = z.enum([
  'CUSTOMER_READ',
  'CUSTOMER_CREATE',
  'CUSTOMER_UPDATE',
  'CUSTOMER_DELETE',
  'CUSTOMER_IMPORT',
  'CUSTOMER_EXPORT',
]);
export type Permission = z.infer<typeof permissionSchema>;

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  ADMIN: [
    'CUSTOMER_READ',
    'CUSTOMER_CREATE',
    'CUSTOMER_UPDATE',
    'CUSTOMER_DELETE',
    'CUSTOMER_IMPORT',
    'CUSTOMER_EXPORT',
  ],
  // A manager runs the day-to-day work but cannot destroy records. This is the
  // gap that makes authorization visible in the UI: the delete action exists
  // and is denied, rather than the role simply not having a screen.
  MANAGER: [
    'CUSTOMER_READ',
    'CUSTOMER_CREATE',
    'CUSTOMER_UPDATE',
    'CUSTOMER_IMPORT',
    'CUSTOMER_EXPORT',
  ],
  VIEWER: ['CUSTOMER_READ'],
};

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Login request.
 *
 * The mock backend does not verify passwords - see docs/mock-backend.md. The
 * field exists because the client's form and the request shape are what later
 * phases build on, and because a password must never be added to a fixture
 * just to make a mock feel realistic.
 */
export const loginRequestSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** The authenticated user, as the client sees it. */
export const sessionUserSchema = z.object({
  id: userIdSchema,
  username: z.string(),
  displayName: z.string(),
  role: roleSchema,
  /** Derived from the role by the server. The client reads, never computes. */
  permissions: z.array(permissionSchema),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const sessionResponseSchema = z.object({
  user: sessionUserSchema,
  /** When the access cookie stops being accepted. Drives refresh in Phase 3. */
  expiresAt: z.iso.datetime({ offset: false }),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/** Name of the CSRF token cookie, and the header it must be echoed in. */
export const CSRF_COOKIE_NAME = 'ecm_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

/** Session cookies. `HttpOnly`, so the application cannot read them. */
export const ACCESS_COOKIE_NAME = 'ecm_access';
export const REFRESH_COOKIE_NAME = 'ecm_refresh';
