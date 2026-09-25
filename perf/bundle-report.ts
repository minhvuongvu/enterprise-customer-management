/**
 * What is in the browser's initial bundle, and why.
 *
 * `ng build` prints chunk sizes; it does not say what is *in* them, nor which
 * lazy chunks the entry point pulls in statically (those count as initial).
 * This reads the esbuild metafile written by `ng build --stats-json` and
 * answers both, grouped by npm package.
 *
 *   npm run build --workspace @ecm/web -- --stats-json
 *   node perf/bundle-report.ts [--json]
 *
 * The numbers are raw (uncompressed) bytes as they appear in the output -
 * the same measure Angular's budget uses - so a figure here can be compared
 * with the budget warning directly.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface MetafileOutput {
  bytes: number;
  entryPoint?: string;
  imports: { path: string; kind: string }[];
  inputs: Record<string, { bytesInOutput: number }>;
}

interface Metafile {
  outputs: Record<string, MetafileOutput>;
}

const STATS = join(import.meta.dirname, '../apps/web/dist/web/stats.json');
const metafile = JSON.parse(readFileSync(STATS, 'utf8')) as Metafile;

/** Browser outputs only - the server bundle has its own entry points. */
const browserOutputs = Object.entries(metafile.outputs).filter(
  ([path]) => !path.startsWith('server/') && !path.endsWith('.mjs') && path.endsWith('.js'),
);
const outputs = new Map(browserOutputs);

const entry = browserOutputs.find(([, output]) => output.entryPoint === 'src/main.ts');
if (!entry) {
  throw new Error('No browser entry point in the metafile - was the build run with --stats-json?');
}

/** Everything reachable from the entry by static import is downloaded before the app starts. */
function staticClosure(start: string, seen = new Set<string>()): Set<string> {
  if (seen.has(start)) {
    return seen;
  }
  seen.add(start);
  for (const dependency of outputs.get(start)?.imports ?? []) {
    if (dependency.kind === 'import-statement') {
      staticClosure(dependency.path, seen);
    }
  }
  return seen;
}

/** `node_modules/@angular/core/...` → `@angular/core`; application code → `app:<folder>`. */
function ownerOf(input: string): string {
  const packagePath = input.split('node_modules/').at(-1) ?? input;
  if (input.includes('node_modules/')) {
    const [scopeOrName, name] = packagePath.split('/');
    return scopeOrName.startsWith('@') ? `${scopeOrName}/${name}` : scopeOrName;
  }
  const appPath = input.match(/src\/app\/([^/]+)/);
  return appPath ? `app:${appPath[1]}` : input.startsWith('angular:') ? 'angular:generated' : input;
}

const initial = staticClosure(entry[0]);
const byOwner = new Map<string, number>();
let total = 0;
for (const path of initial) {
  const output = outputs.get(path);
  if (!output) {
    continue;
  }
  total += output.bytes;
  for (const [input, { bytesInOutput }] of Object.entries(output.inputs)) {
    byOwner.set(ownerOf(input), (byOwner.get(ownerOf(input)) ?? 0) + bytesInOutput);
  }
}

const rows = [...byOwner.entries()]
  .sort(([, a], [, b]) => b - a)
  .map(([owner, bytes]) => ({ owner, kB: +(bytes / 1000).toFixed(1) }));

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify({ initialKB: +(total / 1000).toFixed(1), chunks: initial.size, rows }),
  );
} else {
  console.log(`Initial JavaScript: ${(total / 1000).toFixed(1)} kB raw in ${initial.size} files\n`);
  for (const row of rows.filter((row) => row.kB >= 1)) {
    console.log(`${row.kB.toFixed(1).padStart(8)} kB  ${row.owner}`);
  }
}
