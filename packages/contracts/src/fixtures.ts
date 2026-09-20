import type { Role } from './auth.js';
import type { UserId } from './primitives.js';

/**
 * The one user fixture.
 *
 * Authentication, `createdBy` / `updatedBy` and the audit log's `actor` all
 * resolve against this list. Three separate lists would drift, and an audit
 * trail naming a user who cannot log in is worse than no audit trail.
 *
 * There are no passwords here, deliberately. The mock backend does not verify
 * one (docs/mock-backend.md explains why and what that costs), so there is no
 * credential to commit - and "it is only a fixture" is how credentials end up
 * in repositories.
 */

export interface FixtureUser {
  readonly id: UserId;
  readonly username: string;
  readonly displayName: string;
  readonly role: Role;
}

/** Fixed UUIDs: a seeded dataset that references them must be reproducible. */
export const FIXTURE_USERS: readonly FixtureUser[] = [
  {
    id: '11111111-1111-4111-8111-111111111111' as UserId,
    username: 'admin',
    displayName: 'Avery Admin',
    role: 'ADMIN',
  },
  {
    id: '22222222-2222-4222-8222-222222222222' as UserId,
    username: 'manager',
    displayName: 'Morgan Manager',
    role: 'MANAGER',
  },
  {
    id: '33333333-3333-4333-8333-333333333333' as UserId,
    username: 'viewer',
    displayName: 'Vic Viewer',
    role: 'VIEWER',
  },
];

export function findFixtureUserByUsername(username: string): FixtureUser | undefined {
  return FIXTURE_USERS.find((user) => user.username === username.toLowerCase().trim());
}

export function findFixtureUserById(id: string): FixtureUser | undefined {
  return FIXTURE_USERS.find((user) => user.id === id);
}
