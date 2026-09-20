import type { ApiErrorBody } from '@ecm/contracts';
import { apiErrorBodySchema } from '@ecm/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from './helpers.ts';

/**
 * Every status code the contract defines is reachable, and every error
 * response really is the envelope.
 *
 * A status code that no test can produce is a branch nobody has run - and the
 * frontend's handling of it is then equally untested. This file exists to make
 * that impossible to let slide.
 */

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
});

async function expectEnvelope(response: Response, code: string): Promise<ApiErrorBody> {
  const body = (await response.json()) as ApiErrorBody;
  // Parsed against the contract, not eyeballed: if the server ever drifts from
  // the envelope, this fails here rather than in the browser.
  expect(apiErrorBodySchema.safeParse(body).success).toBe(true);
  expect(body.error.code).toBe(code);
  expect(body.error.correlationId).toBeTruthy();
  return body;
}

describe('status codes', () => {
  it('400 BAD_REQUEST - an unknown mock scenario', async () => {
    const client = server.client();
    const response = await client.call('/api/customers', { scenario: 'definitely-not-a-scenario' });
    expect(response.status).toBe(400);
  });

  it('401 UNAUTHENTICATED - no session', async () => {
    const response = await server.client().call('/api/customers');
    expect(response.status).toBe(401);
    await expectEnvelope(response, 'UNAUTHENTICATED');
  });

  it('403 FORBIDDEN - a role without the permission', async () => {
    const client = server.client();
    await client.login('viewer');
    const response = await client.call('/api/customers/anything', { method: 'DELETE' });
    expect(response.status).toBe(403);
    await expectEnvelope(response, 'FORBIDDEN');
  });

  it('404 NOT_FOUND - a customer that does not exist', async () => {
    const client = server.client();
    await client.login('admin');
    const response = await client.call('/api/customers/11111111-1111-4111-8111-999999999999');
    expect(response.status).toBe(404);
    await expectEnvelope(response, 'NOT_FOUND');
  });

  it('409 CONFLICT - an email that is already taken', async () => {
    const client = server.client();
    await client.login('admin');
    const payload = { fullName: 'First', email: 'taken@example.test' };
    expect((await client.call('/api/customers', { method: 'POST', body: payload })).status).toBe(
      201,
    );

    const response = await client.call('/api/customers', {
      method: 'POST',
      body: { fullName: 'Second', email: 'taken@example.test' },
    });
    expect(response.status).toBe(409);
    await expectEnvelope(response, 'CONFLICT');
  });

  it('413 PAYLOAD_TOO_LARGE', async () => {
    const client = server.client();
    await client.login('admin');
    const response = await client.call('/api/customers', { scenario: 'payload-too-large' });
    expect(response.status).toBe(413);
  });

  it('422 VALIDATION_FAILED - and it names the fields', async () => {
    const client = server.client();
    await client.login('admin');
    const response = await client.call('/api/customers', {
      method: 'POST',
      body: { fullName: '', email: 'not-an-email' },
    });

    expect(response.status).toBe(422);
    const body = await expectEnvelope(response, 'VALIDATION_FAILED');
    expect(Object.keys(body.error.details?.fieldErrors ?? {})).toEqual(
      expect.arrayContaining(['fullName', 'email']),
    );
  });

  it('422 reports a nested field by its dotted path', async () => {
    const client = server.client();
    await client.login('admin');
    const response = await client.call('/api/customers', {
      method: 'POST',
      body: {
        fullName: 'Nested',
        email: 'nested@example.test',
        address: { line1: 'x', line2: null, city: 'y', postalCode: null, country: 'TOO_LONG' },
      },
    });

    const body = await expectEnvelope(response, 'VALIDATION_FAILED');
    // `address.country`, not `address`: a form has to know which input to mark.
    expect(Object.keys(body.error.details?.fieldErrors ?? {})).toContain('address.country');
  });

  it('429 RATE_LIMITED - with a Retry-After the client can obey', async () => {
    const client = server.client();
    await client.login('admin');
    const response = await client.call('/api/customers', { scenario: 'rate-limit' });

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
    const body = await expectEnvelope(response, 'RATE_LIMITED');
    expect(body.error.details?.retryAfterSeconds).toBe(30);
  });

  it('500 INTERNAL_ERROR', async () => {
    const client = server.client();
    await client.login('admin');
    const response = await client.call('/api/customers', { scenario: 'server-error' });
    expect(response.status).toBe(500);
    await expectEnvelope(response, 'INTERNAL_ERROR');
  });

  it('404 for an endpoint that does not exist, in the same envelope', async () => {
    const response = await server.client().call('/api/does-not-exist');
    expect(response.status).toBe(404);
    await expectEnvelope(response, 'NOT_FOUND');
  });

  it('echoes the correlation id the client sent', async () => {
    const response = await server.client().call('/api/health', {
      headers: { 'x-correlation-id': 'cid-from-the-browser' },
    });
    expect(response.headers.get('x-correlation-id')).toBe('cid-from-the-browser');
  });
});
