import { inject } from '@angular/core';
import { RedirectCommand, Router, type CanActivateFn } from '@angular/router';
import type { Permission } from '@ecm/contracts';
import { map } from 'rxjs';
import { SessionService } from './session.service';

/** Where a signed-in user lands when a route is not theirs to open. */
export const FORBIDDEN_PATH = '/forbidden';

/**
 * Route authorization: a route that needs a permission the user does not have
 * renders the "not permitted" page instead.
 *
 * A factory, so the permission is stated on the route itself -
 * `canActivate: [requirePermission('CUSTOMER_CREATE')]` - and reads as what it
 * means. It asks for a permission, never a role: adding a role must not mean
 * editing every route that mentions one.
 *
 * ## Why the address bar shows the refused URL
 *
 * `browserUrl` renders `/forbidden` while writing the URL the user asked for
 * into the address bar. A plain redirect would replace it with `/forbidden`,
 * and the first thing anyone debugging "why can't I open this" needs is the
 * URL they could not open. (`skipLocationChange` looks like the tool for this
 * and is not: on an in-app navigation it leaves the *previous* page's URL in
 * the bar, above content that says something else.)
 *
 * It waits on `restore()` like `authGuard` does. Angular starts the guards of a
 * navigation together and honours the parent's answer first, so this cannot
 * assume the parent has already established the session - and single-flight
 * means the two share one request.
 *
 * **UX, not security.** The API checks the same permission on every request;
 * this only spares the user a page whose every action would be refused.
 */
export function requirePermission(permission: Permission): CanActivateFn {
  return (_route, state) => {
    const session = inject(SessionService);
    const router = inject(Router);

    return session.restore().pipe(
      map((): boolean | RedirectCommand =>
        session.hasPermission(permission)
          ? true
          : new RedirectCommand(router.parseUrl(FORBIDDEN_PATH), {
              browserUrl: state.url,
            }),
      ),
    );
  };
}
