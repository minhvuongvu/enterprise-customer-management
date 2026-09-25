import type { Customer, RealtimeEvent } from '@ecm/contracts';
import { realtimeEventSchema } from '@ecm/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestClient, type TestServer } from './helpers.ts';

/**
 * The server-sent event stream.
 *
 * Read with a plain fetch reader rather than `EventSource`, so the test sees
 * the wire format - `id:`, `event:`, `data:` - and would notice if it changed.
 * That format is the contract a browser's EventSource relies on.
 */

let server: TestServer;
let admin: TestClient;

beforeAll(async () => {
  server = await startTestServer({ customerCount: 20 });
  admin = server.client();
  await admin.login('admin');
});

afterAll(async () => {
  await server.close();
});

interface SseFrame {
  id?: string;
  event?: string;
  data?: string;
}

/** Opens the stream and collects frames until `count` have arrived. */
async function collectFrames(
  count: number,
  trigger: () => Promise<unknown>,
  timeoutMs = 8000,
  headers: Record<string, string> = {},
): Promise<{ frames: SseFrame[]; raw: string }> {
  const abort = new AbortController();
  const response = await fetch(`${server.baseUrl}/api/events`, {
    headers: {
      cookie: `ecm_access=${admin.cookie('ecm_access')}`,
      accept: 'text/event-stream',
      ...headers,
    },
    signal: abort.signal,
  });

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/event-stream');

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  const frames: SseFrame[] = [];

  const deadline = setTimeout(() => abort.abort(), timeoutMs);

  // The trigger runs after the stream is open; an event published before that
  // would never arrive, which is a genuine property of SSE and not a bug.
  await trigger();

  try {
    while (frames.length < count) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      raw += decoder.decode(value, { stream: true });

      let boundary = raw.indexOf('\n\n');
      while (boundary !== -1) {
        const block = raw.slice(0, boundary);
        raw = raw.slice(boundary + 2);

        if (!block.startsWith(':')) {
          const frame: SseFrame = {};
          for (const line of block.split('\n')) {
            const [field, ...rest] = line.split(':');
            const value_ = rest.join(':').trimStart();
            if (field === 'id') frame.id = value_;
            if (field === 'event') frame.event = value_;
            if (field === 'data') frame.data = value_;
          }
          frames.push(frame);
        }
        boundary = raw.indexOf('\n\n');
      }
    }
  } finally {
    clearTimeout(deadline);
    abort.abort();
  }

  return { frames, raw };
}

describe('SSE stream', () => {
  it('requires a session', async () => {
    const response = await fetch(`${server.baseUrl}/api/events`);
    expect(response.status).toBe(401);
  });

  it('delivers a system notice published while the stream is open', async () => {
    const { frames } = await collectFrames(1, () =>
      admin.call('/api/_mock/notice', {
        method: 'POST',
        body: { messageKey: 'notifications.maintenance' },
        csrf: false,
      }),
    );

    expect(frames[0].event).toBe('system.notice');
    expect(frames[0].id).toBeTruthy();

    const parsed = realtimeEventSchema.safeParse(JSON.parse(frames[0].data ?? '{}'));
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('delivers a customer.updated event naming the fields that changed', async () => {
    const created = await admin.json<Customer>('/api/customers', {
      method: 'POST',
      body: { fullName: 'Watched', email: 'watched@example.test' },
    });

    const { frames } = await collectFrames(1, () =>
      admin.call(`/api/customers/${created.body.id}`, {
        method: 'PATCH',
        body: { fullName: 'Watched And Renamed', version: created.body.version },
      }),
    );

    const event = JSON.parse(frames[0].data ?? '{}') as RealtimeEvent;
    expect(event.type).toBe('customer.updated');
    expect(event.type === 'customer.updated' && event.customerId).toBe(created.body.id);
    // The field list lets a client decide whether the change touches what it
    // is showing, instead of refetching everything on every event.
    expect(event.type === 'customer.updated' && event.changedFields).toContain('fullName');
  });

  it('carries an event id, so a reconnecting client can drop duplicates', async () => {
    const { frames } = await collectFrames(2, async () => {
      await admin.call('/api/_mock/notice', {
        method: 'POST',
        body: { messageKey: 'a' },
        csrf: false,
      });
      await admin.call('/api/_mock/notice', {
        method: 'POST',
        body: { messageKey: 'b' },
        csrf: false,
      });
    });

    expect(frames).toHaveLength(2);
    expect(frames[0].id).not.toBe(frames[1].id);
  });
});

describe('reconnecting', () => {
  async function notice(messageKey: string): Promise<void> {
    await admin.call('/api/_mock/notice', { method: 'POST', body: { messageKey }, csrf: false });
  }

  /** Publishes three notices on an open stream and returns their ids. */
  async function threeIds(): Promise<string[]> {
    const { frames } = await collectFrames(3, async () => {
      await notice('one');
      await notice('two');
      await notice('three');
    });
    return frames.map((frame) => frame.id ?? '');
  }

  it('replays what was missed after the Last-Event-ID the browser sends', async () => {
    const [first, second, third] = await threeIds();

    // Reconnect naming the first: the other two arrive, oldest first, and the
    // stream then carries on live.
    const { frames } = await collectFrames(2, async () => undefined, 4000, {
      'last-event-id': first,
    });
    expect(frames.map((frame) => frame.id)).toEqual([second, third]);
  });

  it('accepts the same thing as a query parameter, for a client that opens a new stream', async () => {
    const [, second, third] = await threeIds();

    const abort = new AbortController();
    const response = await fetch(`${server.baseUrl}/api/events?lastEventId=${second}`, {
      headers: { cookie: `ecm_access=${admin.cookie('ecm_access')}` },
      signal: abort.signal,
    });
    const reader = response.body!.getReader();
    let raw = '';
    while (!raw.includes(`id: ${third}`)) {
      const { value, done } = await reader.read();
      if (done) break;
      raw += new TextDecoder().decode(value);
    }
    abort.abort();

    expect(raw).toContain(`id: ${third}`);
    expect(raw).not.toContain(`id: ${second}`);
  });

  it('says it cannot replay an id it no longer remembers, instead of pretending', async () => {
    const abort = new AbortController();
    const response = await fetch(`${server.baseUrl}/api/events`, {
      headers: {
        cookie: `ecm_access=${admin.cookie('ecm_access')}`,
        'last-event-id': 'not-in-the-buffer',
      },
      signal: abort.signal,
    });
    const reader = response.body!.getReader();
    let raw = '';
    while (!raw.includes('event: resync')) {
      const { value, done } = await reader.read();
      if (done) break;
      raw += new TextDecoder().decode(value);
    }
    abort.abort();

    // The client revalidates on this rather than trusting a replay with a hole.
    expect(raw).toContain('event: resync');
  });

  it("ends a session's streams on demand, and leaves other sessions' alone", async () => {
    const other = server.client();
    await other.login('viewer');

    async function open(client: TestClient) {
      const response = await fetch(`${server.baseUrl}/api/events`, {
        headers: {
          cookie: `ecm_access=${client.cookie('ecm_access')}; ecm_csrf=${client.csrfToken}`,
        },
      });
      const reader = response.body!.getReader();
      await reader.read(); // ": connected"
      return reader;
    }
    const mine = await open(admin);
    const theirs = await open(other);

    const closed = await admin.json<{ closed: number }>('/api/_mock/events/disconnect', {
      method: 'POST',
      csrf: false,
    });
    expect(closed.body.closed).toBe(1);

    // The server ended mine: the reader reaches the end instead of waiting.
    let done = false;
    while (!done) {
      done = (await mine.read()).done;
    }
    expect(done).toBe(true);

    // Theirs is still open - a parallel test is not disconnected by this one.
    const pending = await Promise.race([
      theirs.read().then(() => 'data'),
      new Promise((resolve) => setTimeout(() => resolve('still open'), 200)),
    ]);
    expect(pending).toBe('still open');
    await theirs.cancel();
  });

  it('can deliver the same event twice, with the same id - which the client must tolerate', async () => {
    const created = await admin.json<Customer>('/api/customers', {
      method: 'POST',
      body: { fullName: 'Delivered Twice', email: 'twice@example.test' },
    });

    const { frames } = await collectFrames(2, async () => {
      await admin.call(`/api/customers/${created.body.id}`, {
        method: 'PATCH',
        body: { fullName: 'Delivered Twice Renamed', version: created.body.version },
      });
      await admin.call('/api/_mock/events/duplicate', {
        method: 'POST',
        body: { customerId: created.body.id },
        csrf: false,
      });
    });

    expect(frames[0].id).toBe(frames[1].id);
    const event = JSON.parse(frames[0].data ?? '{}') as RealtimeEvent;
    // Carries the code, so "Customer C-000123 was updated" needs no lookup.
    expect(event.type === 'customer.updated' && event.customerCode).toBe(created.body.customerCode);
  });
});
