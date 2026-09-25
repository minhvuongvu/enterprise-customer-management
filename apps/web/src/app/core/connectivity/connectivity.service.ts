import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { NAVIGATOR, WINDOW } from '../platform/platform.tokens';

/**
 * Whether the browser believes it is online, and the moment it comes back
 * (docs/offline.md).
 *
 * ## What `online` actually means
 *
 * `navigator.onLine` and the `online` / `offline` events report whether the
 * device has a network interface that is up - not whether the API is
 * reachable. `false` is reliable: there is no network. `true` is a hope: a
 * captive portal, a dead router or a server outage all look online. So this
 * service is used for what it can honestly say - "you are offline, nothing
 * will be saved" - and a failed request is still classified by the HTTP
 * layer as it always was.
 *
 * ## Two callers
 *
 * The shell, which tells the user they are offline wherever they are; and the
 * offline lab, which switches to its cached copy and refreshes on reconnect.
 *
 * On the server there is no navigator; it reports online, which is what the
 * rendered HTML should assume.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly state = signal(inject(NAVIGATOR)?.onLine ?? true);
  private readonly reconnected = new Subject<void>();

  /** False only when the browser knows there is no network. */
  readonly online = this.state.asReadonly();
  /** Emits each time the browser goes from offline back to online. */
  readonly reconnected$ = this.reconnected.asObservable();

  constructor() {
    const win = inject(WINDOW);
    if (!win) {
      return;
    }
    const goOnline = (): void => {
      const wasOffline = !this.state();
      this.state.set(true);
      if (wasOffline) {
        this.reconnected.next();
      }
    };
    const goOffline = (): void => this.state.set(false);

    win.addEventListener('online', goOnline);
    win.addEventListener('offline', goOffline);
    inject(DestroyRef).onDestroy(() => {
      win.removeEventListener('online', goOnline);
      win.removeEventListener('offline', goOffline);
    });
  }
}
