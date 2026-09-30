/**
 * Fails the build when the production bundle breaks a budget.
 *
 *     npm run build          (writes apps/web/dist/web/stats.json)
 *     node perf/check-budgets.ts
 *
 * Angular's own budget (angular.json) already fails `ng build` past its error
 * threshold for the initial bundle. This adds what it cannot express:
 *
 *  - **the largest lazy chunk** - a route that pulls in a heavy library is
 *    invisible to an initial-bundle budget, and slow all the same;
 *  - **all browser JavaScript** - the total a user downloads visiting
 *    everything, which is what the service worker caches (ADR-0028);
 *  - **code that must never ship** - modules behind a build-time flag
 *    (ADR-0040) and test helpers. Present in a production bundle, they are a
 *    build-time flag that silently stopped working.
 *
 * The limits are in perf/budgets.json. Run in CI after the build
 * (.github/workflows/ci.yml); a failure prints the measurement and the limit.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface MetafileOutput {
  bytes: number;
  entryPoint?: string;
  imports: { path: string; kind: string }[];
  inputs: Record<string, { bytesInOutput: number }>;
}

interface Budgets {
  initialKB: number;
  largestLazyChunkKB: number;
  totalBrowserJavaScriptKB: number;
  neverInProduction: string[];
}

const ROOT = join(import.meta.dirname, '..');
const budgets = JSON.parse(readFileSync(join(ROOT, 'perf/budgets.json'), 'utf8')) as Budgets;
const metafile = JSON.parse(readFileSync(join(ROOT, 'apps/web/dist/web/stats.json'), 'utf8')) as {
  outputs: Record<string, MetafileOutput>;
};

const browser = new Map(
  Object.entries(metafile.outputs).filter(
    ([path]) => !path.startsWith('server/') && path.endsWith('.js'),
  ),
);
const entry = [...browser].find(([, output]) => output.entryPoint === 'src/main.ts');
if (!entry) {
  throw new Error('No browser entry point in stats.json - was the production build run?');
}

function staticClosure(start: string, seen = new Set<string>()): Set<string> {
  if (!seen.has(start)) {
    seen.add(start);
    for (const dependency of browser.get(start)?.imports ?? []) {
      if (dependency.kind === 'import-statement') {
        staticClosure(dependency.path, seen);
      }
    }
  }
  return seen;
}

const kB = (bytes: number) => +(bytes / 1000).toFixed(1);
const initial = staticClosure(entry[0]);
const initialKB = kB([...initial].reduce((sum, path) => sum + (browser.get(path)?.bytes ?? 0), 0));
const lazy = [...browser].filter(([path]) => !initial.has(path));
const [largestPath, largest] = lazy.sort(([, a], [, b]) => b.bytes - a.bytes)[0] ?? [
  '-',
  { bytes: 0 },
];
const totalKB = kB([...browser.values()].reduce((sum, output) => sum + output.bytes, 0));

// An input tree-shaken to nothing is still listed, with 0 bytes: only code
// that actually made it into the output counts as shipped.
const shipped = [...browser.values()].flatMap((output) =>
  Object.entries(output.inputs)
    .filter(([, input]) => input.bytesInOutput > 0)
    .map(([path]) => path),
);
const forbidden = budgets.neverInProduction.flatMap((pattern) =>
  shipped
    .filter((input) => input.includes(pattern))
    .map((input) => `${input} (matches "${pattern}")`),
);

const checks = [
  { name: 'initial JavaScript', actual: initialKB, limit: budgets.initialKB },
  {
    name: `largest lazy chunk (${largestPath})`,
    actual: kB(largest.bytes),
    limit: budgets.largestLazyChunkKB,
  },
  { name: 'all browser JavaScript', actual: totalKB, limit: budgets.totalBrowserJavaScriptKB },
];

let failed = false;
for (const check of checks) {
  const ok = check.actual <= check.limit;
  failed ||= !ok;
  console.log(`${ok ? '  ✓' : '  ✗'} ${check.name}: ${check.actual} kB (budget ${check.limit} kB)`);
}
for (const input of forbidden) {
  failed = true;
  console.log(`  ✗ must never ship, but is in the production bundle: ${input}`);
}
if (forbidden.length === 0) {
  console.log(
    `  ✓ nothing from neverInProduction is in the bundle (${budgets.neverInProduction.length} patterns)`,
  );
}

if (failed) {
  console.error('\nperf/check-budgets: a budget was exceeded - see perf/budgets.json');
  process.exit(1);
}
