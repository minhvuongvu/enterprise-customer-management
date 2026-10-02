import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * A file the build names after its content - `main-<hash>.js`,
 * `chunk-<hash>.js`, `styles-<hash>.css`. A new build gives changed content a
 * new name, so the old name can be cached for ever.
 */
const FINGERPRINTED = /^(?:main|chunk|polyfills|styles|worker)-[\w-]{8,}\.(?:js|css)$/;

/**
 * Serves the built browser files - and decides how long a browser may keep
 * each one without asking again.
 *
 * Only fingerprinted files are cached for a year. Everything else keeps its
 * name across deployments and must be revalidated on every use (`no-cache`
 * still caches; it answers 304 from the ETag when nothing changed). The
 * scaffold's blanket `maxAge: '1y'` cached `config.json` for a year, so a
 * browser that had seen it once never received another deployment's runtime
 * configuration - and a kill switch (docs/feature-flags.md) never reached it.
 * The same applied to the service worker's `ngsw.json` manifest. Found by the
 * Phase 8 review; `e2e-production/production.spec.ts` holds it.
 *
 * An allow-list of what may be cached rather than a list of what may not: a
 * mutable file added later is safe by default.
 */
app.use(
  express.static(browserDistFolder, {
    index: false,
    redirect: false,
    setHeaders: (res, path) => {
      const fileName = path.split(/[\\/]/).pop() ?? '';
      res.setHeader(
        'Cache-Control',
        FINGERPRINTED.test(fileName) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
