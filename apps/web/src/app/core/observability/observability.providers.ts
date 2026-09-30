import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
} from '@angular/core';
import { ConsoleLogSink, LOG_SINKS } from '../logging/logger';
import { provideDevTools } from './dev-tools.providers';
import { PerformanceMonitor } from './performance-monitor';

/**
 * Where the application's observability is assembled (docs/observability.md).
 *
 * - **Sinks.** The console, always: in a browser it is what a developer and a
 *   support engineer look at, and on the server it is the process's stdout,
 *   which a platform collects. The in-memory sink behind the observability
 *   lab only in builds with developer tooling - a build-time flag, applied
 *   by replacing `dev-tools.providers.ts`, so a production bundle does not
 *   contain it (ADR-0040).
 * - **Error tracker.** `ErrorTracker` is root-provided with the logging
 *   implementation. A vendor SDK replaces it here, with one provider.
 * - **Performance.** The monitor starts once the injector exists.
 */
export function provideObservability(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: LOG_SINKS, useClass: ConsoleLogSink, multi: true },
    ...provideDevTools(),
    provideEnvironmentInitializer(() => inject(PerformanceMonitor).start()),
  ]);
}
