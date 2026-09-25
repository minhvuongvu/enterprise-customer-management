import { inject, provideEnvironmentInitializer, type EnvironmentProviders } from '@angular/core';
import { Router } from '@angular/router';
import { filter } from 'rxjs';
import { RETURN_URL_PARAM, SIGN_IN_PATH, SIGN_IN_REASON_PARAM, safeReturnUrl } from './return-url';
import { SessionService } from './session.service';

/**
 * Sends the user to sign in when their session ends by itself - a refresh
 * failed - with the page they were on kept as the destination.
 *
 * One subscriber, at the application root, rather than a redirect in the
 * refresh interceptor: when ten requests fail together, the interceptor runs
 * ten times, but `SessionService.ended$` emits once. Navigation happens once.
 *
 * A deliberate sign-out is not handled here. That is an action the user took,
 * and the component that took it decides where to go next.
 *
 * `router.url` at the moment the session ended is the page the user is on -
 * pages load their data after they activate, so a request that discovers the
 * expiry belongs to the page already in the address bar. It still goes
 * through `safeReturnUrl`: the value becomes a query parameter the login page
 * will follow, and the rule is that nothing is followed unchecked.
 */
export function provideSessionExpiryRedirect(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    const session = inject(SessionService);
    const router = inject(Router);

    session.ended$.pipe(filter((reason) => reason === 'expired')).subscribe(() => {
      void router.navigate([SIGN_IN_PATH], {
        queryParams: {
          [RETURN_URL_PARAM]: safeReturnUrl(router.url),
          [SIGN_IN_REASON_PARAM]: 'expired',
        },
      });
    });
  });
}
