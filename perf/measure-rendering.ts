/**
 * Measures the rendering lab's specimens against each other (docs/rendering.md).
 *
 *   npm run build                       # the production build, server included
 *   node perf/measure-rendering.ts [--runs 7]
 *
 * Starts the production SSR server (`dist/web/server/server.mjs`) on its own
 * port, loads each specimen in a fresh browser context - no cache, no service
 * worker, nothing carried between runs - and records, per load:
 *
 *  - TTFB, FCP and LCP, from the browser's own timing entries;
 *  - when the application became stable (the `ecm:app-stable` mark in
 *    `main.ts`), and how long it took from bootstrap to get there - the cost
 *    of hydration, or of client rendering for the CSR specimen;
 *  - bytes transferred, from the DevTools protocol - what actually crossed
 *    the network, compressed, headers included.
 *
 * Two profiles: the machine as it is, and a throttled one (4x CPU slowdown,
 * 150 ms round trip, 1.6 Mbps down) standing in for a mid-range phone on a
 * poor connection, where rendering decisions actually show. Each number
 * reported is the median of the runs.
 *
 * The mock API is not started: the specimens call no API, which is what makes
 * them comparable. Route preloading is switched off through `/config.json`
 * for the same reason.
 */
import { chromium, type Browser } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_ORIGIN as ORIGIN, startApp } from './production-servers.ts';
const RUNS = Number(process.argv[process.argv.indexOf('--runs') + 1]) || 7;

const TARGETS = [
  '/rendering-lab/client',
  '/rendering-lab/server',
  '/rendering-lab/prerender',
  '/rendering-lab/prerender-no-hydration',
  '/rendering-lab/prerender-incremental',
  '/login',
];

interface Profile {
  name: string;
  cpuSlowdown: number;
  latencyMs: number;
  downloadBytesPerSecond: number;
  uploadBytesPerSecond: number;
}

const PROFILES: Profile[] = [
  {
    name: 'unthrottled',
    cpuSlowdown: 1,
    latencyMs: 0,
    downloadBytesPerSecond: -1,
    uploadBytesPerSecond: -1,
  },
  {
    name: 'throttled',
    cpuSlowdown: 4,
    latencyMs: 150,
    downloadBytesPerSecond: (1.6 * 1024 * 1024) / 8,
    uploadBytesPerSecond: (750 * 1024) / 8,
  },
];

interface Sample {
  ttfb: number;
  fcp: number;
  lcp: number;
  appStable: number;
  bootstrapToStable: number;
  htmlBytes: number;
  totalBytes: number;
}

async function measure(browser: Browser, profile: Profile, path: string): Promise<Sample> {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  // Route preloading would download the shell and customer chunks after the
  // page settles - sooner on a fast profile than a slow one - and pollute the
  // byte count with code the specimen never runs. Off for this measurement;
  // perf/measure-production.ts measures preloading on its own.
  await context.route('**/config.json', (route) =>
    route.fulfill({ json: { features: { technicalLabs: true, routePreloading: false } } }),
  );
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: profile.latencyMs,
    downloadThroughput: profile.downloadBytesPerSecond,
    uploadThroughput: profile.uploadBytesPerSecond,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });

  let totalBytes = 0;
  let htmlBytes = 0;
  let ttfb = NaN;
  const documentRequests = new Set<string>();
  cdp.on('Network.requestWillBeSent', (event) => {
    if (event.type === 'Document') {
      documentRequests.add(event.requestId);
    }
  });
  // TTFB from DevTools' own timing of the document request: request sent to
  // response headers received. Navigation Timing's \`responseStart\` did not
  // reflect the emulated latency reliably in this setup.
  cdp.on('Network.responseReceived', (event) => {
    if (event.type === 'Document' && event.response.timing) {
      ttfb = event.response.timing.receiveHeadersEnd - event.response.timing.sendStart;
    }
  });
  cdp.on('Network.loadingFinished', (event) => {
    totalBytes += event.encodedDataLength;
    if (documentRequests.has(event.requestId)) {
      htmlBytes += event.encodedDataLength;
    }
  });

  await page.goto(`${ORIGIN}${path}`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => performance.getEntriesByName('ecm:app-stable').length > 0,
    null,
    {
      timeout: 60_000,
    },
  );
  // LCP is final once the page is idle and nothing new has painted.
  await page.waitForTimeout(500);

  const timings = await page.evaluate(
    () =>
      new Promise<Omit<Sample, 'ttfb' | 'htmlBytes' | 'totalBytes'>>((resolve) => {
        new PerformanceObserver((list) => {
          const mark = (name: string): number =>
            performance.getEntriesByName(name)[0]?.startTime ?? NaN;
          resolve({
            fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? NaN,
            lcp: list.getEntries().at(-1)?.startTime ?? NaN,
            appStable: mark('ecm:app-stable'),
            bootstrapToStable: mark('ecm:app-stable') - mark('ecm:bootstrap-start'),
          });
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      }),
  );

  await context.close();
  return { ttfb, ...timings, htmlBytes, totalBytes };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const stop = await startApp();
const browser = await chromium.launch();
const results: Record<string, Record<string, Sample>> = {};

try {
  for (const profile of PROFILES) {
    results[profile.name] = {};
    for (const path of TARGETS) {
      // One warm-up load per target, discarded: the first request after the
      // server starts pays for its own JIT, which is not what is measured.
      await measure(browser, profile, path);
      const samples: Sample[] = [];
      for (let run = 0; run < RUNS; run++) {
        samples.push(await measure(browser, profile, path));
      }
      const keys = Object.keys(samples[0]) as (keyof Sample)[];
      results[profile.name][path] = Object.fromEntries(
        keys.map((key) => [key, Math.round(median(samples.map((sample) => sample[key])))]),
      ) as unknown as Sample;
    }
  }
} finally {
  await browser.close();
  stop();
}

for (const [profile, byPath] of Object.entries(results)) {
  console.log(`\n### ${profile} (median of ${RUNS} runs)\n`);
  console.log(
    '| Page | TTFB ms | FCP ms | LCP ms | Stable at ms | Bootstrap→stable ms | HTML bytes | Total bytes |',
  );
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [path, sample] of Object.entries(byPath)) {
    console.log(
      `| \`${path}\` | ${sample.ttfb} | ${sample.fcp} | ${sample.lcp} | ${sample.appStable} | ${sample.bootstrapToStable} | ${sample.htmlBytes} | ${sample.totalBytes} |`,
    );
  }
}

mkdirSync(join(import.meta.dirname, 'results'), { recursive: true });
writeFileSync(
  join(import.meta.dirname, 'results/rendering.json'),
  JSON.stringify(
    { measuredAt: new Date().toISOString(), runs: RUNS, profiles: PROFILES, results },
    null,
    2,
  ) + '\n',
);
