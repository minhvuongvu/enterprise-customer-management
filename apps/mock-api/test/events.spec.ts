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
): Promise<{ frames: SseFrame[]; raw: string }> {
  const abort = new AbortController();
  const response = await fetch(`${server.baseUrl}/api/events`, {
    headers: {
      cookie: `ecm_access=${admin.cookie('ecm_access')}`,
      accept: 'text/event-stream',
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
