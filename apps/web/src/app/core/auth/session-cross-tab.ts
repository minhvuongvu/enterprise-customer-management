import { inject, provideEnvironmentInitializer, type EnvironmentProviders } from '@angular/core';
import { filter } from 'rxjs';
import { TabChannel } from '../cross-tab/tab-channel';
import { SessionService } from './session.service';

/** The session's topic on the tab channel. */
export const SESSION_TOPIC = 'session';

/** The only thing the session says to other tabs. */
interface SignedOutMessage {
  readonly event: 'signed-out';
}

function isSignedOut(payload: unknown): payload is SignedOutMessage {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { event?: unknown }).event === 'signed-out'
  );
}

/**
 * A sign-out in one tab ends the session in every tab (debt row 18).
 *
 * Without it, the other tabs keep showing customer data until their next
 * request fails - the server session is gone, but the page does not know.
 *
 * ## Only a deliberate sign-out is announced
 *
 * Not an expiry. A tab's refresh can fail for reasons that are that tab's
 * own - most obviously, it lost the race described in `SessionService.
 * refresh()` - while another tab still holds a perfectly good session.
 * Broadcasting "expired" would let one tab's failure sign out the tab that
 * won. Each tab discovers an expiry by itself, on its next request.
 *
 * ## No echo
 *
 * The receiving tab ends with `signed-out-elsewhere`, which is not announced
 * again, and a `BroadcastChannel` never delivers a message to its sender; so
 * one sign-out produces exactly one message, whatever the number of tabs.
 *
 * This is UX. The server ended the session when the first tab's request
 * arrived; the others could not have used it anyway.
 */
export function provideSessionCrossTab(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    const session = inject(SessionService);
    const tabs = inject(TabChannel);

    session.ended$
      .pipe(filter((reason) => reason === 'signed-out'))
      .subscribe(() =>
        tabs.post(SESSION_TOPIC, { event: 'signed-out' } satisfies SignedOutMessage),
      );

    tabs
      .on(SESSION_TOPIC)
      .pipe(filter(isSignedOut))
      .subscribe(() => session.endedElsewhere());
  });
}
