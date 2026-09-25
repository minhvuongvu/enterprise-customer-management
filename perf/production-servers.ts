/**
 * The production build and the mock API, running together, for measurements
 * and the production test suite.
 *
 * The production server (`dist/web/server/server.mjs`) serves the
 * application and nothing else - in a deployment a reverse proxy puts the API
 * on the same origin. Here the browser plays that proxy: `forwardApi` routes
 * every `/api` request from the page to the mock API, so cookies stay
 * first-party exactly as they are behind a real proxy, and the production
 * server needs no development-only code.
 */
import type { BrowserContext } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
export const APP_PORT = 4400;
export const API_PORT = 4300;
export const APP_ORIGIN = `http://localhost:${APP_PORT}`;
export const API_ORIGIN = `http://localhost:${API_PORT}`;

async function waitFor(url: string, process: ChildProcess, what: string): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      if ((await fetch(url)).ok) {
        return;
      }
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  process.kill();
  throw new Error(`${what} did not start (${url}).`);
}

/** Starts the SSR server for the production build. Run `npm run build` first. */
export async function startApp(): Promise<() => void> {
  const server = spawn('node', [join(ROOT, 'apps/web/dist/web/server/server.mjs')], {
    // The server refuses Host headers it does not know (SSRF protection,
    // `security.allowedHosts` in angular.json); this names the one it is
    // reached by here.
    env: { ...process.env, PORT: String(APP_PORT), NG_ALLOWED_HOSTS: 'localhost' },
    stdio: 'ignore',
  });
  await waitFor(`${APP_ORIGIN}/login`, server, 'The SSR server - was `npm run build` run?');
  return () => server.kill();
}

/** Starts the mock API without artificial latency, unless one is already running. */
export async function startApi(): Promise<() => void> {
  try {
    if ((await fetch(`${API_ORIGIN}/api/health`)).ok) {
      return () => undefined;
    }
  } catch {
    // not running: start it
  }
  const api = spawn('npm', ['run', 'serve', '--workspace', '@ecm/mock-api'], {
    cwd: ROOT,
    env: { ...process.env, MOCK_API_LATENCY_MS: '0', MOCK_API_JITTER_MS: '0' },
    stdio: 'ignore',
    detached: true,
  });
  await waitFor(`${API_ORIGIN}/api/health`, api, 'The mock API');
  // `npm run` starts a child; kill the whole group.
  return () => process.kill(-(api.pid ?? 0));
}

/**
 * Sends the page's `/api` requests to the mock API, as a reverse proxy would.
 *
 * `route.fetch` issues the request from the context - sharing its cookies -
 * and `fulfill` hands the response to the page as if its own origin had
 * answered, so \`Set-Cookie\` lands where the application expects it.
 * (`route.continue` cannot change the host.) The event stream is refused:
 * `fetch` would wait for a response that never ends, and nothing measured
 * here needs live updates - the realtime client reports itself reconnecting.
 */
export async function forwardApi(context: BrowserContext): Promise<void> {
  await context.route(`${APP_ORIGIN}/api/**`, async (route) => {
    const url = route.request().url().replace(APP_ORIGIN, API_ORIGIN);
    if (new URL(url).pathname === '/api/events') {
      await route.abort();
      return;
    }
    await route.fulfill({ response: await route.fetch({ url }) });
  });
}
