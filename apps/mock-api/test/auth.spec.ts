import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  type SessionResponse,
} from '@ecm/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from './helpers.ts';

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer({ customerCount: 20 });
});

afterAll(async () => {
  await server.close();
});

describe('login', () => {
  it('sets the session cookies with the right flags', async () => {
    const client = server.client();
    const response = await client.login('admin');
    const cookies = response.headers.getSetCookie();

    const access = cookies.find((cookie) => cookie.startsWith(`${ACCESS_COOKIE_NAME}=`));
    expect(access).toBeDefined();
    // HttpOnly is the whole argument for cookies over a token in localStorage:
    // injected script cannot read it.
    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Lax/i);

    const refresh = cookies.find((cookie) => cookie.startsWith(`${REFRESH_COOKIE_NAME}=`));
    // Scoped to the endpoint that uses it, so it is not sent with every request.
    expect(refresh).toMatch(/Path=\/api\/auth\/refresh/i);

    const csrf = cookies.find((cookie) => cookie.startsWith(`${CSRF_COOKIE_NAME}=`));
    // Deliberately readable by script - the client has to echo it in a header.
    expect(csrf).not.toMatch(/HttpOnly/i);
  });

  it('returns the user with permissions the server derived', async () => {
    const client = server.client();
    const response = await client.login('manager');
    const body = (await response.json()) as SessionResponse;

    expect(body.user.username).toBe('manager');
    expect(body.user.displayName).toBe('Morgan Manager');
    expect(body.user.permissions).toContain('CUSTOMER_UPDATE');
    expect(body.user.permissions).not.toContain('CUSTOMER_DELETE');
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects an unknown user without revealing that it is unknown', async () => {
    const client = server.client();
    const response = await client.call('/api/auth/login', {
      method: 'POST',
      body: { username: 'nobody', password: 'x' },
      csrf: false,
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { message: string } };
    // The same wording as a wrong password, so the endpoint cannot be used to
    // enumerate accounts.
    expect(body.error.message).toBe('Invalid username or password.');
  });

  it('rejects an empty password - the shape is still validated', async () => {
    const response = await server.client().call('/api/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: '' },
      csrf: false,
    });
    expect(response.status).toBe(422);
  });
});

describe('session', () => {
  it('is readable once signed in and refused once signed out', async () => {
    const client = server.client();
    await client.login('admin');
    expect((await client.call('/api/auth/session')).status).toBe(200);

    expect((await client.call('/api/auth/logout', { method: 'POST' })).status).toBe(204);
    expect((await client.call('/api/auth/session')).status).toBe(401);
  });
});

describe('CSRF', () => {
  it('refuses an unsafe request without the header, even with a valid session', async () => {
    const client = server.client();
    await client.login('admin');

    const response = await client.call('/api/customers', {
      method: 'POST',
      body: { fullName: 'No token', email: 'csrf@example.test' },
      csrf: false,
    });

    // The cookie was sent - a cross-site form post would send it too. The
    // header is what the attacker's page cannot produce.
    expect(response.status).toBe(403);
  });

  it('refuses a header that does not match the cookie', async () => {
    const client = server.client();
    await client.login('admin');

    const response = await client.call('/api/customers', {
      method: 'POST',
      body: { fullName: 'Wrong token', email: 'csrf2@example.test' },
      csrf: false,
      headers: { 'x-csrf-token': 'not-the-cookie-value' },
    });
    expect(response.status).toBe(403);
  });

  it('allows a GET without the header', async () => {
    const client = server.client();
    await client.login('admin');
    expect((await client.call('/api/customers?size=1')).status).toBe(200);
  });
});

describe('refresh', () => {
  it('issues a new access token and rotates the refresh token', async () => {
    const client = server.client();
    await client.login('admin');
    const firstAccess = client.cookie(ACCESS_COOKIE_NAME);
    const firstRefresh = client.cookie(REFRESH_COOKIE_NAME);

    const response = await client.call('/api/auth/refresh', { method: 'POST' });
    expect(response.status).toBe(200);

    expect(client.cookie(ACCESS_COOKIE_NAME)).not.toBe(firstAccess);
    expect(client.cookie(REFRESH_COOKIE_NAME)).not.toBe(firstRefresh);
  });

  it('refuses a refresh token that has already been used', async () => {
    const client = server.client();
    await client.login('admin');
    const original = client.cookie(REFRESH_COOKIE_NAME);

    await client.call('/api/auth/refresh', { method: 'POST' });

    // Replay the original. Rotation is what makes a stolen refresh token worth
    // little, and what Phase 3's "only one refresh in flight" rule protects.
    const replay = await fetch(`${server.baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        cookie: `${REFRESH_COOKIE_NAME}=${original}; ${CSRF_COOKIE_NAME}=${client.csrfToken}`,
        'x-csrf-token': client.csrfToken ?? '',
      },
    });
    expect(replay.status).toBe(401);
  });

  it('refuses when there is no refresh cookie at all', async () => {
    const client = server.client();
    await client.login('admin');
    client.clearCookies();
    expect((await client.call('/api/auth/refresh', { method: 'POST', csrf: false })).status).toBe(
      403,
    );
  });
});

describe('expired session', () => {
  it('responds 401 to a protected route once the access token has expired', async () => {
    const client = server.client();
    await client.login('admin');

    // The scenario expires the access token deterministically, instead of
    // waiting fifteen minutes for it.
    expect(
      (await client.call('/api/customers?size=1', { scenario: 'expired-session' })).status,
    ).toBe(401);
  });

  it('leaves the refresh token usable, which is the whole point', async () => {
    const client = server.client();
    await client.login('admin');
    await client.call('/api/customers?size=1', { scenario: 'expired-session' });

    expect((await client.call('/api/auth/refresh', { method: 'POST' })).status).toBe(200);
    expect((await client.call('/api/customers?size=1')).status).toBe(200);
  });
});
