import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { RealtimeEvent } from '@ecm/contracts';
import { EVENT_SOURCE_FACTORY } from '../platform/platform.tokens';
import { provideTestHttp } from '../testing/http-testing';
import { sessionResponseFor } from '../testing/session-testing';
import { RECONNECT_BASE_DELAY_MS, RealtimeClient } from './realtime-client';

/**
 * An EventSource the test drives by hand.
 *
 * Reconnection and duplicate delivery are about *when* things happen, and a
 * real stream cannot be told when to drop. This one records what it was asked
 * to open and lets the test open it, deliver events, and fail it - in either
 * of the two ways a browser's EventSource fails.
 */
class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;

  readyState = FakeEventSource.CONNECTING;
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private readonly listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  // ------------------------------------------------------------ test controls

  open(): void {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.();
  }

  deliver(event: RealtimeEvent): void {
    this.emit(event.type, JSON.stringify(event));
  }

  emit(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data }));
    }
  }

  /** A network drop the browser is retrying on its own. */
  drop(): void {
    this.readyState = FakeEventSource.CONNECTING;
    this.onerror?.();
  }

  /** An error status - an expired session, a 500. The browser gives up. */
  fail(): void {
    this.readyState = FakeEventSource.CLOSED;
    this.onerror?.();
  }
}

function updated(id: string): RealtimeEvent {
  return {
    type: 'customer.updated',
    id,
    at: '2026-09-25T10:00:00.000Z' as RealtimeEvent['at'],
    customerId: '11111111-1111-4111-8111-111111111112' as never,
    customerCode: 'C-000001',
    actorId: '11111111-1111-4111-8111-111111111111' as never,
    changedFields: ['fullName'],
  };
}

describe('RealtimeClient', () => {
  let client: RealtimeClient;
  let backend: HttpTestingController;
  let opened: FakeEventSource[];
  let received: RealtimeEvent[];

  beforeEach(() => {
    vi.useFakeTimers();
    opened = [];
    TestBed.configureTestingModule({
      providers: [
        provideTestHttp(),
        {
          provide: EVENT_SOURCE_FACTORY,
          useValue: (url: string) => {
            const source = new FakeEventSource(url);
            opened.push(source);
            return source as unknown as EventSource;
          },
        },
      ],
    });
    client = TestBed.inject(RealtimeClient);
    backend = TestBed.inject(HttpTestingController);
    received = [];
    client.events$.subscribe((event) => received.push(event));
  });

  afterEach(() => {
    backend.verify();
    vi.useRealTimers();
  });

  function latest(): FakeEventSource {
    return opened[opened.length - 1];
  }

  it('reports its connection state as it goes', () => {
    expect(client.status()).toBe('idle');

    client.connect();
    expect(client.status()).toBe('connecting');
    expect(latest().url).toBe('/api/events');

    latest().open();
    expect(client.status()).toBe('open');
  });

  it('opens one stream, however many times it is asked to connect', () => {
    client.connect();
    client.connect();
    expect(opened).toHaveLength(1);
  });

  it('delivers events, validated against the contract', () => {
    client.connect();
    latest().open();

    latest().deliver(updated('e-1'));
    // Well-formed JSON that is not an event the contract knows is dropped,
    // not handed to a consumer to fail on.
    latest().emit('customer.updated', JSON.stringify({ type: 'customer.updated', id: 'x' }));
    latest().emit('customer.updated', 'not json');

    expect(received.map((event) => event.id)).toEqual(['e-1']);
  });

  it('drops an event it has already delivered - duplicates are normal with SSE', () => {
    client.connect();
    latest().open();

    latest().deliver(updated('e-1'));
    latest().deliver(updated('e-2'));
    // A replay after a reconnect overlaps what already arrived.
    latest().deliver(updated('e-1'));
    latest().deliver(updated('e-2'));
    latest().deliver(updated('e-3'));

    expect(received.map((event) => event.id)).toEqual(['e-1', 'e-2', 'e-3']);
  });

  it('lets the browser retry a dropped connection, and says it is reconnecting', () => {
    client.connect();
    latest().open();

    latest().drop();
    expect(client.status()).toBe('reconnecting');
    // Not a second stream: the browser is retrying this one, with Last-Event-ID.
    expect(opened).toHaveLength(1);

    latest().open();
    expect(client.status()).toBe('open');
  });

  it('takes over when the browser gives up: renews the session, then reopens where it left off', async () => {
    client.connect();
    latest().open();
    latest().deliver(updated('e-7'));

    latest().fail();
    expect(client.status()).toBe('reconnecting');
    expect(latest().closed).toBe(true);

    // Backoff first - nothing is asked of the server immediately.
    backend.expectNone('/api/auth/session');
    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_DELAY_MS);

    // Through HttpClient, so an expired access token is refreshed on the way.
    backend.expectOne('/api/auth/session').flush(sessionResponseFor('admin'));

    expect(opened).toHaveLength(2);
    // A new stream cannot set Last-Event-ID; it asks by query parameter.
    expect(latest().url).toBe('/api/events?lastEventId=e-7');

    latest().open();
    expect(client.status()).toBe('open');
  });

  it('backs off further each time the server stays unreachable', async () => {
    client.connect();
    latest().fail();

    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_DELAY_MS);
    backend.expectOne('/api/auth/session').error(new ProgressEvent('error'));

    // Twice the delay before the next attempt.
    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_DELAY_MS);
    backend.expectNone('/api/auth/session');
    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_DELAY_MS);
    backend.expectOne('/api/auth/session').flush(sessionResponseFor('admin'));

    expect(opened).toHaveLength(2);
  });

  it('stops reconnecting when the session cannot be renewed', async () => {
    client.connect();
    latest().fail();

    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_DELAY_MS);
    backend.expectOne('/api/auth/session').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });

    // The session is over; there is nothing to reconnect to.
    expect(client.status()).toBe('idle');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(opened).toHaveLength(1);
  });

  it('announces a resync, so consumers revalidate instead of trusting a gap', () => {
    let resyncs = 0;
    client.resync$.subscribe(() => resyncs++);
    client.connect();

    latest().emit('resync', '{}');
    expect(resyncs).toBe(1);
  });

  it('cleans up completely on disconnect: stream closed, retry cancelled', async () => {
    client.connect();
    latest().fail();

    client.disconnect();
    expect(client.status()).toBe('idle');
    expect(opened[0].closed).toBe(true);

    // The pending retry was cancelled with it: no session check, no new stream.
    await vi.advanceTimersByTimeAsync(60_000);
    backend.expectNone('/api/auth/session');
    expect(opened).toHaveLength(1);
  });

  it('disconnects when its injector is destroyed', () => {
    client.connect();
    latest().open();

    TestBed.resetTestingModule();

    expect(opened[0].closed).toBe(true);
  });
});
