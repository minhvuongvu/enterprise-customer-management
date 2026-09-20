import type { BulkResponse, Customer, PageResponse } from '@ecm/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MOCK_SCENARIOS } from '../src/middleware/fault-injection.ts';
import { startTestServer, type TestClient, type TestServer } from './helpers.ts';

/**
 * Every published scenario does what it claims.
 *
 * The list is served from `/api/_mock/scenarios` and documented in
 * docs/mock-backend.md. A scenario that is documented but broken is worse than
 * one that does not exist, because a test written against it passes for the
 * wrong reason.
 */

let server: TestServer;
let admin: TestClient;

beforeAll(async () => {
  server = await startTestServer({ customerCount: 50 });
  admin = server.client();
  await admin.login('admin');
});

afterAll(async () => {
  await server.close();
});

describe('the scenario catalogue', () => {
  it('is served, so documentation cannot drift from behaviour', async () => {
    const { status, body } = await admin.json<{ header: string; scenarios: { name: string }[] }>(
      '/api/_mock/scenarios',
    );

    expect(status).toBe(200);
    expect(body.header).toBe('x-mock-scenario');
    expect(body.scenarios.map((scenario) => scenario.name).sort()).toEqual(
      MOCK_SCENARIOS.map((scenario) => scenario.name).sort(),
    );
  });

  it('every scenario has a description', () => {
    for (const scenario of MOCK_SCENARIOS) {
      expect(scenario.description.length, scenario.name).toBeGreaterThan(10);
    }
  });

  it('rejects a scenario it does not know, rather than running the happy path', async () => {
    // A typo in a test must fail loudly. Silently ignoring it produces a green
    // test that proves nothing.
    expect((await admin.call('/api/customers', { scenario: 'typo' })).status).toBe(400);
  });
});

describe('transport scenarios', () => {
  it.each([
    ['server-error', 500],
    ['unauthorized', 401],
    ['forbidden', 403],
    ['not-found', 404],
    ['validation-error', 422],
    ['rate-limit', 429],
    ['payload-too-large', 413],
  ])('%s responds %i', async (scenario, expected) => {
    expect((await admin.call('/api/customers?size=1', { scenario })).status).toBe(expected);
  });

  it('slow still succeeds, just later', async () => {
    const started = Date.now();
    const response = await admin.call('/api/customers?size=1', { scenario: 'slow' });

    expect(response.status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(2900);
  }, 20_000);

  it('network-drop produces a transport failure, not an HTTP status', async () => {
    // This is the case a `catch` around fetch must handle, and the reason the
    // client's error taxonomy has a `network` kind separate from `server`.
    await expect(
      admin.call('/api/customers?size=1', { scenario: 'network-drop' }),
    ).rejects.toThrow();
  });
});

describe('handler scenarios', () => {
  it('conflict makes a versioned write fail as though someone else had saved', async () => {
    const created = await admin.json<Customer>('/api/customers', {
      method: 'POST',
      body: { fullName: 'Conflict Target', email: 'conflict-scenario@example.test' },
    });

    const response = await admin.call(`/api/customers/${created.body.id}`, {
      method: 'PATCH',
      body: { fullName: 'Will not apply', version: created.body.version },
      scenario: 'conflict',
    });
    expect(response.status).toBe(409);
  });

  it('invalid-credentials fails a login that would otherwise succeed', async () => {
    const client = server.client();
    const response = await client.call('/api/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: 'anything' },
      csrf: false,
      scenario: 'invalid-credentials',
    });
    expect(response.status).toBe(401);
  });

  it('partial-bulk-failure fails every second item', async () => {
    const { body: page } = await admin.json<PageResponse<Customer>>('/api/customers?size=4');
    const ids = page.items.map((item) => item.id);

    const { body } = await admin.json<BulkResponse>('/api/customers/bulk', {
      method: 'POST',
      body: { action: 'DEACTIVATE', ids },
      scenario: 'partial-bulk-failure',
    });

    expect(body.requested).toBe(4);
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(2);
  });
});

describe('mock controls', () => {
  it('reports and accepts changes to latency', async () => {
    const before = await admin.json<{ latencyMs: number }>('/api/_mock/controls');
    expect(before.status).toBe(200);

    const patched = await admin.json<{ latencyMs: number }>('/api/_mock/controls', {
      method: 'PATCH',
      body: { latencyMs: 5 },
      csrf: false,
    });
    expect(patched.body.latencyMs).toBe(5);

    await admin.call('/api/_mock/controls', {
      method: 'PATCH',
      body: { latencyMs: 0 },
      csrf: false,
    });
  });

  it('rejects a control it does not have', async () => {
    const response = await admin.call('/api/_mock/controls', {
      method: 'PATCH',
      body: { nonsense: true },
      csrf: false,
    });
    expect(response.status).toBe(422);
  });
});
