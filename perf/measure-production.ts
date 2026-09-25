/**
 * Before/after measurements on the production build (docs/performance.md).
 *
 *   npm run build
 *   node perf/measure-production.ts [--runs 5]
 *
 * Starts the production server and the mock API (perf/production-servers.ts)
 * and measures, in a real Chromium:
 *
 *  1. **Route preloading** - sign in on a throttled connection and time the
 *     arrival of the customer list, with `routePreloading` on and off. The
 *     flag is flipped by answering `/config.json`, so both runs use the same
 *     build.
 *  2. **The performance lab's demos**, each against its own "before":
 *     debounced vs immediate search, `computed()` vs a template method,
 *     virtual vs plain list, NgOptimizedImage vs original uploads, and a Web
 *     Worker vs the main thread.
 *
 * Each figure is the median of the runs. Results go to stdout as Markdown
 * and to perf/results/production.json.
 */
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { API_ORIGIN, APP_ORIGIN, forwardApi, startApi, startApp } from './production-servers.ts';

const RUNS = Number(process.argv[process.argv.indexOf('--runs') + 1]) || 5;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function signedInContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: APP_ORIGIN, serviceWorkers: 'block' });
  await forwardApi(context);
  // Signs in through the mock API directly; the cookies are for "localhost",
  // which is the application's host too - ports do not separate cookies.
  const response = await context.request.post(`${API_ORIGIN}/api/auth/login`, {
    data: { username: 'admin', password: 'not-verified-by-the-mock' },
  });
  if (!response.ok()) {
    throw new Error(`Sign-in failed: ${response.status()}`);
  }
  return context;
}

/** Throttles like perf/measure-rendering.ts: 4x CPU, 150 ms RTT, 1.6 Mbps. */
async function throttle(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

/** Sign-in to customer list, from the click. Returns milliseconds. */
async function signInToList(browser: Browser, preloading: boolean): Promise<number> {
  const context = await browser.newContext({ baseURL: APP_ORIGIN, serviceWorkers: 'block' });
  await forwardApi(context);
  await context.route(`${APP_ORIGIN}/config.json`, (route) =>
    route.fulfill({ json: { features: { technicalLabs: true, routePreloading: preloading } } }),
  );
  const page = await context.newPage();
  await throttle(page);
  await page.goto('/login');
  await page.waitForFunction(() => performance.getEntriesByName('ecm:app-stable').length > 0);
  // A user takes a few seconds to type; preloading uses them. Idle the page
  // the same way in both runs so only the flag differs.
  await page.waitForLoadState('networkidle');

  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('any');
  const started = Date.now();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.locator('table tbody tr').first().waitFor({ timeout: 60_000 });
  const elapsed = Date.now() - started;
  await context.close();
  return elapsed;
}

async function labPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await signedInContext(browser);
  const page = await context.newPage();
  await page.goto('/technical-labs/performance');
  await page.getByTestId('rate-search').waitFor();
  return { page, close: () => context.close() };
}

async function number(page: Page, testId: string): Promise<number> {
  return Number(await page.getByTestId(testId).textContent());
}

async function searchDemo(browser: Browser) {
  const { page, close } = await labPage(browser);
  // Typing at about 100 words per minute.
  await page
    .getByTestId('rate-search')
    .getByRole('searchbox')
    .pressSequentially('anbel cor', { delay: 60 });
  await page.waitForTimeout(600);
  const result = {
    immediateScans: await number(page, 'immediate-scans'),
    immediateMs: await number(page, 'immediate-ms'),
    debouncedScans: await number(page, 'debounced-scans'),
    debouncedMs: await number(page, 'debounced-ms'),
  };
  await close();
  return result;
}

async function derivedDemo(browser: Browser) {
  const { page, close } = await labPage(browser);
  const ms = async (button: string): Promise<number> => {
    await page.getByTestId(button).click();
    const text = (await page.getByTestId('derived-result').textContent()) ?? '';
    return Number(text.match(/(\d+) ms in total/)?.[1]);
  };
  const result = {
    methodMs: await ms('derived-run-method'),
    computedMs: await ms('derived-run-computed'),
  };
  await close();
  return result;
}

async function listDemo(browser: Browser) {
  const { page, close } = await labPage(browser);
  await page.getByRole('heading', { name: 'Virtual scrolling' }).scrollIntoViewIfNeeded();
  const run = async (button: string, ready: string) => {
    await page.getByTestId(button).click();
    await page.getByTestId(ready).waitFor();
    await page.waitForTimeout(300);
    return {
      ms: await number(page, 'virtual-render-ms'),
      elements: await number(page, 'virtual-dom-elements'),
    };
  };
  const result = {
    plain1000: await run('render-plain-1000', 'plain-list'),
    plain10000: await run('render-plain-10000', 'plain-list'),
    virtual100000: await run('render-virtual', 'virtual-list'),
  };
  await close();
  return result;
}

async function imageDemo(browser: Browser, mode: 'unoptimized' | 'optimized') {
  const { page, close } = await labPage(browser);
  const sizes: Promise<number>[] = [];
  page.on('requestfinished', (request) => {
    if (request.url().includes('/labs/images/')) {
      sizes.push(request.sizes().then((size) => size.responseBodySize + size.responseHeadersSize));
    }
  });
  await page.getByTestId(`images-${mode}`).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  const bytes = (await Promise.all(sizes)).reduce((sum, size) => sum + size, 0);
  await close();
  return { requests: sizes.length, kilobytes: Math.round(bytes / 1024) };
}

async function workerDemo(browser: Browser) {
  const { page, close } = await (async () => {
    const context = await signedInContext(browser);
    const page = await context.newPage();
    await page.goto('/technical-labs/workers');
    return { page, close: () => context.close() };
  })();
  const run = async (where: 'main' | 'worker') => {
    await page.getByTestId(`primes-${where}`).click();
    const selector = `[data-testid="primes-result"][data-where="${where === 'main' ? 'main-thread' : 'worker'}"]`;
    await page.locator(selector).waitFor({ timeout: 60_000 });
    const text = (await page.locator(selector).textContent()) ?? '';
    return {
      totalMs: Number(text.match(/(\d+) ms in total/)?.[1]),
      longestFrameMs: Number(text.match(/took (\d+) ms/)?.[1]),
    };
  };
  const result = { main: await run('main'), worker: await run('worker') };
  await close();
  return result;
}

/** Runs `measure` RUNS times and takes the median of every numeric leaf. */
async function repeated<T>(measure: () => Promise<T>): Promise<T> {
  const samples: T[] = [];
  for (let run = 0; run < RUNS; run++) {
    samples.push(await measure());
  }
  const combine = (values: unknown[]): unknown =>
    typeof values[0] === 'number'
      ? median(values as number[])
      : Object.fromEntries(
          Object.keys(values[0] as object).map((key) => [
            key,
            combine(values.map((value) => (value as Record<string, unknown>)[key])),
          ]),
        );
  return combine(samples) as T;
}

const stopApi = await startApi();
const stopApp = await startApp();
const browser = await chromium.launch();

try {
  const results = {
    preloading: {
      offMs: await repeated(() => signInToList(browser, false)),
      onMs: await repeated(() => signInToList(browser, true)),
    },
    search: await repeated(() => searchDemo(browser)),
    derived: await repeated(() => derivedDemo(browser)),
    list: await repeated(() => listDemo(browser)),
    images: {
      unoptimized: await repeated(() => imageDemo(browser, 'unoptimized')),
      optimized: await repeated(() => imageDemo(browser, 'optimized')),
    },
    worker: await repeated(() => workerDemo(browser)),
  };
  console.log(JSON.stringify(results, null, 2));
  mkdirSync(join(import.meta.dirname, 'results'), { recursive: true });
  writeFileSync(
    join(import.meta.dirname, 'results/production.json'),
    JSON.stringify({ measuredAt: new Date().toISOString(), runs: RUNS, results }, null, 2) + '\n',
  );
} finally {
  await browser.close();
  stopApp();
  stopApi();
}
