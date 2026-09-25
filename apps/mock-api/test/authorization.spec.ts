import type { Customer, PageResponse, Role, SessionResponse } from '@ecm/contracts';
import { ROLE_PERMISSIONS } from '@ecm/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from './helpers.ts';

/**
 * Authorization is enforced by the server, independently of any client.
 *
 * Every request here is made directly against the API. No Angular is involved,
 * no guard runs, no button is hidden. That is the whole point: the frontend's
 * permission checks decide what to *show*, and this decides what is *allowed*.
 * If these tests ever pass only because the UI would not have made the call,
 * the security boundary has moved to the wrong side.
 */

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer({ customerCount: 50 });
});

afterAll(async () => {
  await server.close();
});

async function sessionFor(role: 'admin' | 'manager' | 'viewer') {
  const client = server.client();
  const response = await client.login(role);
  const body = (await response.json()) as SessionResponse;
  return { client, body };
}

async function anyCustomerId(): Promise<string> {
  const { client } = await sessionFor('admin');
  const { body } = await client.json<PageResponse<Customer>>('/api/customers?size=1');
  return body.items[0].id;
}

describe('the session reports permissions derived from the role', () => {
  it.each(['admin', 'manager', 'viewer'] as const)('%s', async (username) => {
    const { body } = await sessionFor(username);
    const role = username.toUpperCase() as Role;

    expect(body.user.role).toBe(role);
    // Derived server-side from one shared matrix, so the client never has to
    // compute - or guess - what a role means.
    expect([...body.user.permissions].sort()).toEqual([...ROLE_PERMISSIONS[role]].sort());
  });
});

describe('VIEWER', () => {
  it('may read', async () => {
    const { client } = await sessionFor('viewer');
    expect((await client.call('/api/customers?size=1')).status).toBe(200);
  });

  it('may not create', async () => {
    const { client } = await sessionFor('viewer');
    const response = await client.call('/api/customers', {
      method: 'POST',
      body: { fullName: 'Nope', email: 'viewer-create@example.test' },
    });
    expect(response.status).toBe(403);
  });

  it('may not update', async () => {
    const id = await anyCustomerId();
    const { client } = await sessionFor('viewer');
    const response = await client.call(`/api/customers/${id}`, {
      method: 'PATCH',
      body: { fullName: 'Nope', version: 1 },
    });
    expect(response.status).toBe(403);
  });

  it('may not delete', async () => {
    const id = await anyCustomerId();
    const { client } = await sessionFor('viewer');
    expect((await client.call(`/api/customers/${id}`, { method: 'DELETE' })).status).toBe(403);
  });

  it('may not export', async () => {
    const { client } = await sessionFor('viewer');
    expect((await client.call('/api/customers/export')).status).toBe(403);
  });

  it('may not import or upload, and is refused before the file is even read', async () => {
    const id = await anyCustomerId();
    const { client } = await sessionFor('viewer');

    // Authorization runs before the upload is parsed, so a refused user cannot
    // make the server buffer five megabytes on their behalf.
    const imported = await client.uploadFile(
      '/api/customers/import',
      'people.csv',
      'text/csv',
      'fullName,email\nX,x@example.test\n',
    );
    expect(imported.status).toBe(403);

    const avatar = await client.uploadFile(
      `/api/customers/${id}/avatar`,
      'a.png',
      'image/png',
      'not really a png',
    );
    expect(avatar.status).toBe(403);
  });
});

describe('MANAGER', () => {
  it('may create and update', async () => {
    const { client } = await sessionFor('manager');
    const created = await client.json<Customer>('/api/customers', {
      method: 'POST',
      body: { fullName: 'Manager Made', email: 'manager-create@example.test' },
    });
    expect(created.status).toBe(201);

    const updated = await client.call(`/api/customers/${created.body.id}`, {
      method: 'PATCH',
      body: { status: 'ACTIVE', version: created.body.version },
    });
    expect(updated.status).toBe(200);
  });

  it('may not delete - the gap that makes authorization visible', async () => {
    const id = await anyCustomerId();
    const { client } = await sessionFor('manager');
    expect((await client.call(`/api/customers/${id}`, { method: 'DELETE' })).status).toBe(403);
  });

  it('may not bulk delete either, though bulk update is allowed', async () => {
    const id = await anyCustomerId();
    const { client } = await sessionFor('manager');

    expect(
      (
        await client.call('/api/customers/bulk', {
          method: 'POST',
          body: { action: 'DEACTIVATE', ids: [id] },
        })
      ).status,
    ).toBe(200);

    // The permission depends on the action inside the body, so a route-level
    // check would have got this wrong.
    expect(
      (
        await client.call('/api/customers/bulk', {
          method: 'POST',
          body: { action: 'DELETE', ids: [id] },
        })
      ).status,
    ).toBe(403);
  });
});

describe('ADMIN', () => {
  it('may delete', async () => {
    const id = await anyCustomerId();
    const { client } = await sessionFor('admin');
    expect((await client.call(`/api/customers/${id}`, { method: 'DELETE' })).status).toBe(204);
  });
});

describe('authentication is required before authorization is even considered', () => {
  it('rejects an anonymous read with 401, not 403', async () => {
    // The distinction matters to the client: 401 means "sign in", 403 means
    // "signing in again will not help".
    expect((await server.client().call('/api/customers')).status).toBe(401);
  });

  it('rejects a forged session cookie', async () => {
    const client = server.client();
    const response = await fetch(`${server.baseUrl}/api/customers`, {
      headers: { cookie: 'ecm_access=made-up-token' },
    });
    expect(response.status).toBe(401);
    expect(client).toBeDefined();
  });
});
