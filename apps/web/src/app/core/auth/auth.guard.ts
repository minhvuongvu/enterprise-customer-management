import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { map } from 'rxjs';
import { RETURN_URL_PARAM, SIGN_IN_PATH } from './return-url';
import { SessionService } from './session.service';

/**
 * Lets a signed-in user into the application shell, and sends everyone else to
 * sign in with the address they asked for preserved.
 *
 * It is attached once, to the shell branch of the route tree, so every page
 * inside it is covered - including ones added later - without anyone having to
 * remember to add it.
 *
 * `restore()` is what makes a reload work: the guard runs before anything has
 * asked the server who the user is, so it asks, once, and waits. Treating
 * `unknown` as `anonymous` here would send a signed-in user to the login page
 * on every refresh of the browser.
 *
 * **This is a navigation-UX control, not a security boundary.** Someone who
 * edits the bundle to make this return `true` reaches an empty shell whose
 * every request the API answers with 401. ANGULAR_PROJECT_CONTEXT.md 3.2.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);

  return session.restore().pipe(
    map((status) =>
      status === 'authenticated'
        ? true
        : router.createUrlTree([SIGN_IN_PATH], {
            queryParams: { [RETURN_URL_PARAM]: state.url },
          }),
    ),
  );
};
