import type { ApiErrorBody, BulkResponse, Customer, PageResponse } from '@ecm/contracts';
import { customerSchema } from '@ecm/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestClient, type TestServer } from './helpers.ts';

let server: TestServer;
let admin: TestClient;

beforeAll(async () => {
  server = await startTestServer({ customerCount: 300 });
  admin = server.client();
  await admin.login('admin');
});

afterAll(async () => {
  await server.close();
});

describe('customer list', () => {
  it('returns a page that describes itself', async () => {
    const { body } = await admin.json<PageResponse<Customer>>('/api/customers?page=2&size=10');

    expect(body.page).toBe(2);
    expect(body.size).toBe(10);
    expect(body.items).toHaveLength(10);
    expect(body.totalItems).toBeGreaterThan(0);
    // Without a total the client cannot render "page 2 of 30", and a list that
    // cannot say how much there is is the wrong lesson to teach.
    expect(body.totalPages).toBe(Math.ceil(body.totalItems / 10));
  });

  it('returns items that satisfy the published schema', async () => {
    const { body } = await admin.json<PageResponse<Customer>>('/api/customers?size=25');

    for (const item of body.items) {
      const parsed = customerSchema.safeParse(item);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
  });

  it('applies defaults when the query says nothing', async () => {
    const { body } = await admin.json<PageResponse<Customer>>('/api/customers');
    expect(body.page).toBe(1);
    expect(body.size).toBe(20);
  });

  it('sorts, in both directions', async () => {
    const ascending = await admin.json<PageResponse<Customer>>(
      '/api/customers?sort=fullName,asc&size=50',
    );
    const descending = await admin.json<PageResponse<Customer>>(
      '/api/customers?sort=fullName,desc&size=50',
    );

    const names = ascending.body.items.map((item) => item.fullName);
    expect([...names].sort((a, b) => a.localeCompare(b, 'en'))).toEqual(names);
    expect(descending.body.items[0].fullName).not.toBe(ascending.body.items[0].fullName);
  });

  it('rejects a sort field it does not recognise instead of ignoring it', async () => {
    // Silently ignoring an unknown sort is how a UI ends up showing unsorted
    // data while insisting it is sorted.
    const response = await admin.call('/api/customers?sort=DROP TABLE,asc');
    expect(response.status).toBe(422);
  });

  it('filters by status', async () => {
    const { body } = await admin.json<PageResponse<Customer>>(
      '/api/customers?status=INACTIVE&size=50',
    );
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((item) => item.status === 'INACTIVE')).toBe(true);
  });

  it('searches across name, email and customer code', async () => {
    const { body: all } = await admin.json<PageResponse<Customer>>('/api/customers?size=1');
    const target = all.items[0];

    const byCode = await admin.json<PageResponse<Customer>>(
      `/api/customers?search=${encodeURIComponent(target.customerCode)}`,
    );
    expect(byCode.body.items.map((item) => item.id)).toContain(target.id);

    const byEmail = await admin.json<PageResponse<Customer>>(
      `/api/customers?search=${encodeURIComponent(target.email)}`,
    );
    expect(byEmail.body.items.map((item) => item.id)).toContain(target.id);
  });

  it('filters by a created-date range, inclusively', async () => {
    const { body } = await admin.json<PageResponse<Customer>>(
      '/api/customers?createdFrom=2024-01-01&createdTo=2024-12-31&size=50',
    );
    expect(
      body.items.every(
        (item) =>
          item.createdAt.slice(0, 10) >= '2024-01-01' &&
          item.createdAt.slice(0, 10) <= '2024-12-31',
      ),
    ).toBe(true);
  });

  it('returns an empty page rather than an error when nothing matches', async () => {
    const { status, body } = await admin.json<PageResponse<Customer>>(
      '/api/customers?search=zzzz-no-such-customer',
    );
    expect(status).toBe(200);
    expect(body.items).toEqual([]);
    expect(body.totalItems).toBe(0);
  });
});

describe('customer writes', () => {
  async function create(email: string): Promise<Customer> {
    const { body } = await admin.json<Customer>('/api/customers', {
      method: 'POST',
      body: { fullName: 'Test Person', email },
    });
    return body;
  }

  it('creates with server-owned fields the client never sends', async () => {
    const created = await create('created@example.test');

    expect(created.id).toBeTruthy();
    expect(created.customerCode).toMatch(/^C-\d{6}$/);
    expect(created.version).toBe(1);
    // A client that could set createdBy could forge an audit trail.
    expect(created.createdBy).toBe('11111111-1111-4111-8111-111111111111');
    expect(created.createdAt).toBe(created.updatedAt);
  });

  it('applies contract defaults for omitted optional fields', async () => {
    const created = await create('defaults@example.test');
    expect(created.status).toBe('PROSPECT');
    expect(created.gender).toBe('UNSPECIFIED');
    expect(created.tags).toEqual([]);
    expect(created.phone).toBeNull();
  });

  it('rejects an unknown field instead of silently dropping it', async () => {
    const response = await admin.call('/api/customers', {
      method: 'POST',
      body: { fullName: 'X', email: 'strict@example.test', isAdmin: true },
    });
    expect(response.status).toBe(422);
  });

  it('updates and bumps the version', async () => {
    const created = await create('update@example.test');
    const { status, body } = await admin.json<Customer>(`/api/customers/${created.id}`, {
      method: 'PATCH',
      body: { fullName: 'Renamed', version: created.version },
    });

    expect(status).toBe(200);
    expect(body.fullName).toBe('Renamed');
    expect(body.version).toBe(created.version + 1);
    expect(body.updatedAt >= created.updatedAt).toBe(true);
  });

  it('refuses a stale write and says which version is current', async () => {
    const created = await create('stale@example.test');
    await admin.call(`/api/customers/${created.id}`, {
      method: 'PATCH',
      body: { fullName: 'First writer wins', version: created.version },
    });

    // Second writer still holds the version it loaded - exactly the situation
    // Phase 4's conflict UI has to handle.
    const { status, body } = await admin.json<ApiErrorBody>(`/api/customers/${created.id}`, {
      method: 'PATCH',
      body: { fullName: 'Second writer', version: created.version },
    });

    expect(status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.details?.currentVersion).toBe(created.version + 1);
  });

  it('records an audit entry describing what changed', async () => {
    const created = await create('audit@example.test');
    await admin.call(`/api/customers/${created.id}`, {
      method: 'PATCH',
      body: { fullName: 'Audited Name', version: created.version },
    });

    const { body } = await admin.json<{
      items: { action: string; changes: { field: string }[]; actorDisplayName: string }[];
    }>(`/api/customers/${created.id}/audit`);

    expect(body.items[0].action).toBe('CUSTOMER_UPDATED');
    expect(body.items[0].changes.map((change) => change.field)).toContain('fullName');
    // The actor resolves against the same fixture that authenticated us.
    expect(body.items[0].actorDisplayName).toBe('Avery Admin');
  });

  it('deletes, and then reports the customer as gone', async () => {
    const created = await create('delete@example.test');

    expect((await admin.call(`/api/customers/${created.id}`, { method: 'DELETE' })).status).toBe(
      204,
    );
    expect((await admin.call(`/api/customers/${created.id}`)).status).toBe(404);
  });
});

describe('bulk operations', () => {
  it('reports an outcome per item, not one status for the batch', async () => {
    const { body: page } = await admin.json<PageResponse<Customer>>('/api/customers?size=3');
    const ids = page.items.map((item) => item.id);

    const { status, body } = await admin.json<BulkResponse>('/api/customers/bulk', {
      method: 'POST',
      body: { action: 'DEACTIVATE', ids },
    });

    expect(status).toBe(200);
    expect(body.requested).toBe(3);
    expect(body.succeeded).toBe(3);
    expect(body.results).toHaveLength(3);
  });

  it('succeeds partially when some ids do not exist', async () => {
    const { body: page } = await admin.json<PageResponse<Customer>>('/api/customers?size=1');
    const missing = '11111111-1111-4111-8111-999999999999';

    const { body } = await admin.json<BulkResponse>('/api/customers/bulk', {
      method: 'POST',
      body: { action: 'ACTIVATE', ids: [page.items[0].id, missing] },
    });

    // 200 with a mixed result: throwing away the successful item because one
    // id was wrong would be worse than reporting both outcomes.
    expect(body.succeeded).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.results.find((result) => result.id === missing)?.errorCode).toBe('NOT_FOUND');
  });
});
