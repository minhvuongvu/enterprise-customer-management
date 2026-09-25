import {
  inject,
  provideEnvironmentInitializer,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import {
  findFixtureUserByUsername,
  permissionsForRole,
  type SessionResponse,
} from '@ecm/contracts';
import { of, throwError } from 'rxjs';
import { SessionApi } from '../api/session.api';
import { SessionService } from '../auth/session.service';
import { appError } from '../errors/app-error';

/**
 * A signed-in session for component and store tests.
 *
 * Test-only. Nothing in the application imports this file.
 *
 * It replaces `SessionApi`, not `SessionService`: the service under every page
 * is the real one, with its real permission checks, and only the transport
 * underneath it is canned. A hand-written fake `SessionService` would let a
 * test pass against permission logic that production does not have.
 *
 * The session is restored before the first component is created, so a page
 * renders as it would for that user from the first frame. `refresh()` fails,
 * deterministically - a test that wants a successful refresh drives
 * `SessionService` through `HttpTestingController` instead (see
 * `session.service.spec.ts`).
 *
 * The user is one of the shared fixture users, so "manager" here is the same
 * manager the mock API knows. Permissions are derived the way the server
 * derives them, from the one matrix in `@ecm/contracts`.
 */
export type FixtureUsername = 'admin' | 'manager' | 'viewer';

/** What the server answers for a fixture user, with permissions derived as it derives them. */
export function sessionResponseFor(username: FixtureUsername): SessionResponse {
  const user = findFixtureUserByUsername(username);
  if (!user) {
    throw new Error(`No fixture user named ${username}.`);
  }
  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      permissions: [...permissionsForRole(user.role)],
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
}

export function provideSignedInAs(username: FixtureUsername): (Provider | EnvironmentProviders)[] {
  const response = sessionResponseFor(username);

  const api: Pick<SessionApi, 'current' | 'login' | 'refresh' | 'logout'> = {
    current: () => of(response),
    login: () => of(response),
    refresh: () => throwError(() => appError('authentication')),
    logout: () => of(undefined),
  };

  return [
    { provide: SessionApi, useValue: api },
    provideEnvironmentInitializer(() => {
      inject(SessionService).restore().subscribe();
    }),
  ];
}
