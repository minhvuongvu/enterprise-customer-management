import type { Server } from 'node:http';
import { CSRF_COOKIE_NAME } from '@ecm/contracts';
import { createApp } from '../src/app.ts';
import type { MockApiConfig } from '../src/config.ts';
import type { MockStore } from '../src/domain/store.ts';

/**
 * Starts the real server on an ephemeral port.
 *
 * Over a real socket, not by calling handlers in process: cookies, CORS,
 * preflights, status codes and streaming are the things this server exists to
 * provide, and none of them are exercised by invoking an Express handler
 * directly. The dataset is small and latency is off, so this stays fast.
 */

export interface TestServer {
  readonly baseUrl: string;
  readonly store: MockStore;
  close(): Promise<void>;
  client(): TestClient;
}

export async function startTestServer(overrides: Partial<MockApiConfig> = {}): Promise<TestServer> {
  const built = createApp({ customerCount: 300, port: 0, ...overrides }, false);
  built.controls.latencyMs = 0;
  built.controls.jitterMs = 0;

  const server: Server = built.app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    baseUrl: `http://localhost:${port}`,
    store: built.store,
    client: () => new TestClient(`http://localhost:${port}`),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export interface CallOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  scenario?: string;
  /** Send the CSRF header. Default true for unsafe methods. */
  csrf?: boolean;
}

/**
 * A browser-ish client: it keeps cookies between calls, the way a real one
 * does. Without that, nothing about the session or CSRF flow can be tested.
 */
export class TestClient {
  private cookies = new Map<string, string>();

  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  get csrfToken(): string | undefined {
    return this.cookies.get(CSRF_COOKIE_NAME);
  }

  cookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  clearCookies(): void {
    this.cookies.clear();
  }

  async call(path: string, options: CallOptions = {}): Promise<Response> {
    const method = options.method ?? 'GET';
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const headers: Record<string, string> = { ...options.headers };

    if (options.body !== undefined) {
      headers['content-type'] ??= 'application/json';
    }
    if (this.cookies.size > 0) {
      headers['cookie'] = [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    }
    if (options.scenario) {
      headers['x-mock-scenario'] = options.scenario;
    }
    if (unsafe && (options.csrf ?? true) && this.csrfToken) {
      headers['x-csrf-token'] = this.csrfToken;
    }

    const response = await fetch(this.baseUrl + path, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    this.absorb(response);
    return response;
  }

  /** Calls and parses JSON in one step, for the common case. */
  async json<T>(path: string, options: CallOptions = {}): Promise<{ status: number; body: T }> {
    const response = await this.call(path, options);
    return { status: response.status, body: (await response.json()) as T };
  }

  async login(username: string): Promise<Response> {
    // The mock accepts any non-empty password by design; see the module comment
    // on auth.routes.ts. Nothing here is a credential.
    return this.call('/api/auth/login', {
      method: 'POST',
      body: { username, password: 'not-verified' },
      csrf: false,
    });
  }

  async uploadFile(
    path: string,
    fileName: string,
    contentType: string,
    content: Buffer | string,
  ): Promise<Response> {
    const form = new FormData();
    form.append('file', new Blob([content], { type: contentType }), fileName);

    const headers: Record<string, string> = {};
    if (this.cookies.size > 0) {
      headers['cookie'] = [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    }
    if (this.csrfToken) {
      headers['x-csrf-token'] = this.csrfToken;
    }

    const response = await fetch(this.baseUrl + path, { method: 'POST', headers, body: form });
    this.absorb(response);
    return response;
  }

  private absorb(response: Response): void {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === '') {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }
}
