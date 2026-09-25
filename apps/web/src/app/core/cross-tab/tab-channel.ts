import { DestroyRef, inject, Injectable } from '@angular/core';
import { filter, map, Subject, type Observable } from 'rxjs';
import { BROADCAST_CHANNEL_FACTORY } from '../platform/platform.tokens';

/** The one channel every tab of the application shares. Versioned, see below. */
export const TAB_CHANNEL_NAME = 'ecm.tabs.v1';

/**
 * What travels between tabs: a topic, and a payload only the topic's owner
 * understands.
 */
interface TabEnvelope {
  readonly topic: string;
  readonly payload: unknown;
}

function isEnvelope(data: unknown): data is TabEnvelope {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { topic?: unknown }).topic === 'string' &&
    'payload' in data
  );
}

/**
 * Messages between tabs of this application in the same browser profile
 * (docs/cross-tab.md).
 *
 * A `BroadcastChannel` delivers what one tab posts to every *other* tab on the
 * same origin - never back to the sender, which is exactly the property the
 * callers rely on: a tab never reacts to its own announcement.
 *
 * ## Why core knows no topics
 *
 * Two owners use it - the session (a sign-out ends every tab) and the
 * customer feature (a change made here is news there) - and core must not
 * learn customer vocabulary to serve the second. So the channel carries a
 * topic and an opaque payload, and **each owner validates its own payload**.
 * That validation is not optional: a tab running an older build of the
 * application, after a deploy, is on the same channel and may send shapes
 * this build has never seen. The channel name carries a version for the day a
 * change cannot be made compatible.
 *
 * ## What it is not
 *
 * Not a transport for data. It carries *that* something changed, and each
 * tab refetches what it shows through its own HTTP layer - with its own
 * authorisation. Copying records between tabs would be a second, unvalidated
 * path for server data.
 *
 * Where there is no `BroadcastChannel` (the server), `post` does nothing and
 * `on` never emits; callers do not branch.
 */
@Injectable({ providedIn: 'root' })
export class TabChannel {
  private readonly channel = inject(BROADCAST_CHANNEL_FACTORY)(TAB_CHANNEL_NAME);
  private readonly received = new Subject<TabEnvelope>();

  constructor() {
    const channel = this.channel;
    if (!channel) {
      return;
    }
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (isEnvelope(event.data)) {
        this.received.next(event.data);
      }
    };
    channel.addEventListener('message', onMessage);
    inject(DestroyRef).onDestroy(() => {
      channel.removeEventListener('message', onMessage);
      channel.close();
    });
  }

  /** Tells every other tab. The payload must be structured-cloneable. */
  post(topic: string, payload: unknown): void {
    this.channel?.postMessage({ topic, payload } satisfies TabEnvelope);
  }

  /** Payloads other tabs posted on `topic`, still unvalidated. */
  on(topic: string): Observable<unknown> {
    return this.received.pipe(
      filter((envelope) => envelope.topic === topic),
      map((envelope) => envelope.payload),
    );
  }
}
