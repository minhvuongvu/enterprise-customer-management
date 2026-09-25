import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  LAST_EVENT_ID_PARAM,
  REALTIME_EVENT_TYPES,
  RESYNC_EVENT,
  realtimeEventSchema,
  type RealtimeEvent,
} from '@ecm/contracts';
import { Subject, type Subscription } from 'rxjs';
import { SessionApi } from '../api/session.api';
import { AppConfigStore } from '../config/app-config';
import { isAppError } from '../errors/app-error';
import { Logger } from '../logging/logger';
import { EVENT_SOURCE_FACTORY } from '../platform/platform.tokens';

/**
 * The application's one server-sent event stream: its connection state, its
 * reconnection, and the de-duplication of what it delivers.
 *
 * ## Why SSE
 *
 * The scenario is one-way - "user A changed C-000001, tell user B" - and SSE
 * is one-way HTTP: the session cookie, the proxy and the CORS policy already
 * cover it, and the browser brings reconnection and `Last-Event-ID` with it.
 * WebSocket would add a second protocol for a direction nothing travels in.
 * ADR-0006 made the choice; ADR-0020 is this client.
 *
 * ## Two kinds of failure, two kinds of reconnect
 *
 * `EventSource` reconnects by itself after a network drop, and sends
 * `Last-Event-ID` so the server can replay what was missed. It gives up for
 * good when the server answers with an error status - which is what an
 * expired access cookie produces - and it never says which status, because
 * the API has no way to. So:
 *
 *  - while the browser is retrying (`readyState === CONNECTING`) this client
 *    only reports `reconnecting`;
 *  - once the browser has given up (`CLOSED`), this client takes over: it
 *    waits with exponential backoff, then asks `GET /auth/session` through
 *    `HttpClient`. That request goes through the refresh interceptor, so an
 *    expired access token is renewed on the way - the one thing an
 *    `EventSource` cannot do for itself. Then it opens a new stream, naming the
 *    last event it saw in `?lastEventId=`, because a new stream cannot set the
 *    header.
 *
 * If the session cannot be renewed, the session has ended, the application
 * sends the user to sign in (`session-expiry.ts`), and the shell's teardown
 * disconnects this client.
 *
 * ## Duplicates are normal
 *
 * A replay after a reconnect overlaps what arrived before the drop. Every
 * event has an id, and the ids of the last `SEEN_ID_LIMIT` events are kept;
 * an id seen before is dropped here, so no consumer has to think about it.
 *
 * ## Lifetime
 *
 * Root-provided, because there is one stream per tab, but **connected only
 * while the application shell exists** - the shell calls `connect()` and its
 * destruction calls `disconnect()`. Nothing is open on the sign-in page, and
 * nothing is left open after sign-out: the stream, the retry timer and the
 * pending session check are all released by `disconnect()`.
 */

export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';

/** Ids remembered for de-duplication. Comfortably more than a replay can repeat. */
export const SEEN_ID_LIMIT = 500;
/** First retry after the browser gives up, doubled each time, capped. */
export const RECONNECT_BASE_DELAY_MS = 1_000;
export const RECONNECT_MAX_DELAY_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class RealtimeClient {
  private readonly openSource = inject(EVENT_SOURCE_FACTORY);
  private readonly sessionApi = inject(SessionApi);
  private readonly config = inject(AppConfigStore).config;
  private readonly logger = inject(Logger);

  private readonly statusState = signal<RealtimeStatus>('idle');
  readonly status = this.statusState.asReadonly();
  readonly connected = computed(() => this.statusState() === 'open');

  private readonly eventStream = new Subject<RealtimeEvent>();
  /** Each event once, in arrival order, already validated against the contract. */
  readonly events$ = this.eventStream.asObservable();

  private readonly resyncStream = new Subject<void>();
  /**
   * The stream reconnected and the server could not say what was missed.
   * Whatever a consumer shows may be stale: revalidate it.
   */
  readonly resync$ = this.resyncStream.asObservable();

  private source: EventSource | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionCheck: Subscription | null = null;
  private attempt = 0;
  private lastEventId: string | null = null;

  /** Insertion-ordered, so the oldest id is the first to forget. */
  private readonly seenIds = new Set<string>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  /** Opens the stream. Calling it while connected does nothing. */
  connect(): void {
    if (this.statusState() !== 'idle') {
      return;
    }
    this.open();
  }

  /** Closes the stream and cancels any pending reconnect. Safe to call twice. */
  disconnect(): void {
    this.source?.close();
    this.source = null;
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.sessionCheck?.unsubscribe();
    this.sessionCheck = null;
    this.attempt = 0;
    this.statusState.set('idle');
  }

  private open(): void {
    const base = `${this.config().apiBaseUrl}/events`;
    const url = this.lastEventId
      ? `${base}?${LAST_EVENT_ID_PARAM}=${encodeURIComponent(this.lastEventId)}`
      : base;

    const source = this.openSource(url);
    if (!source) {
      // The server renders pages; it never holds a stream open for one.
      return;
    }
    this.source = source;
    this.statusState.set(this.attempt === 0 ? 'connecting' : 'reconnecting');

    source.onopen = () => {
      this.attempt = 0;
      this.statusState.set('open');
    };

    source.onerror = () => {
      if (source.readyState === source.CLOSED) {
        // The browser has given up - an error status, typically an expired
        // session. Recovering is this client's job now.
        this.scheduleReconnect();
      } else {
        // A dropped connection the browser is already retrying, with
        // Last-Event-ID. Report it, and let it.
        this.statusState.set('reconnecting');
      }
    };

    for (const type of REALTIME_EVENT_TYPES) {
      source.addEventListener(type, (message) => this.receive(message as MessageEvent<string>));
    }
    source.addEventListener(RESYNC_EVENT, () => this.resyncStream.next());
  }

  private receive(message: MessageEvent<string>): void {
    let event: RealtimeEvent;
    try {
      const parsed = realtimeEventSchema.safeParse(JSON.parse(message.data));
      if (!parsed.success) {
        this.logger.warn('Realtime event did not match the contract', { type: message.type });
        return;
      }
      event = parsed.data;
    } catch {
      this.logger.warn('Realtime event was not JSON', { type: message.type });
      return;
    }

    this.lastEventId = event.id;
    if (this.seenIds.has(event.id)) {
      // A replay overlapping what already arrived. Normal with SSE.
      this.logger.debug('Duplicate realtime event dropped', { id: event.id, type: event.type });
      return;
    }
    this.remember(event.id);
    this.eventStream.next(event);
  }

  private remember(id: string): void {
    this.seenIds.add(id);
    if (this.seenIds.size > SEEN_ID_LIMIT) {
      const oldest = this.seenIds.values().next();
      if (!oldest.done) {
        this.seenIds.delete(oldest.value);
      }
    }
  }

  private scheduleReconnect(): void {
    this.source?.close();
    this.source = null;
    this.statusState.set('reconnecting');

    const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** this.attempt);
    this.attempt += 1;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      // Through HttpClient, so the refresh interceptor can renew an expired
      // access token before the stream is asked for again.
      this.sessionCheck = this.sessionApi.current().subscribe({
        next: () => {
          this.sessionCheck = null;
          this.open();
        },
        error: (error: unknown) => {
          this.sessionCheck = null;
          if (isAppError(error) && error.kind === 'authentication') {
            // The session is over; the application is already on its way to
            // the sign-in page. Nothing to reconnect to.
            this.disconnect();
            return;
          }
          // The server is unreachable. Keep trying, more slowly.
          this.scheduleReconnect();
        },
      });
    }, delay);
  }
}
