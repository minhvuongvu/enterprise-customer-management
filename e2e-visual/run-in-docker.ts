/**
 * Runs the visual suite inside the Playwright image, on any machine.
 *
 *     npm run e2e:visual            compare against the baselines
 *     npm run e2e:visual:update     rewrite the baselines
 *
 * The repository is mounted as it is; dependencies are installed inside the
 * container (into container-only volumes), because the host's native
 * binaries - esbuild, lmdb - are built for the host's platform, which on a
 * Windows or macOS laptop is not the container's.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const IMAGE = 'mcr.microsoft.com/playwright:v1.63.0-noble';
const root = join(import.meta.dirname, '..');
const update = process.argv.includes('--update');

const nodeModuleVolumes = [
  'node_modules',
  'apps/web/node_modules',
  'apps/mock-api/node_modules',
  'packages/contracts/node_modules',
].flatMap((path) => ['-v', `/work/${path}`]);

const command = [
  'npm ci --ignore-scripts --no-audit --no-fund',
  'npm run build:contracts',
  `npx playwright test -c playwright.visual.config.ts${update ? ' --update-snapshots' : ''}`,
].join(' && ');

const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--ipc=host',
    '-e',
    'PLAYWRIGHT_VISUAL_IN_DOCKER=1',
    '-v',
    `${root}:/work`,
    ...nodeModuleVolumes,
    '-w',
    '/work',
    IMAGE,
    'bash',
    '-c',
    command,
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
