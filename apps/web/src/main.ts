import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Two marks the rendering lab reads (technical-labs/rendering/page-load-
// metrics.ts, perf/measure-rendering.ts): when the JavaScript started the
// application, and when the application was first stable - hydrated or
// rendered, with nothing pending. The names are duplicated there rather than
// imported, so this file pulls no lab code into the initial bundle.
performance.mark('ecm:bootstrap-start');

bootstrapApplication(App, appConfig)
  .then((appRef) => appRef.whenStable())
  .then(() => performance.mark('ecm:app-stable'))
  .catch((err) => console.error(err));
