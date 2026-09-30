import type { Provider } from '@angular/core';
import { LOG_INSPECTION } from '../logging/log-inspection';
import { LOG_SINKS } from '../logging/logger';
import { MemoryLogSink } from '../logging/memory-log-sink';

/**
 * Developer tooling: a build-time flag (docs/feature-flags.md, ADR-0040).
 *
 * This file is in development and test builds. A production build replaces it
 * with `dev-tools.providers.production.ts` (angular.json `fileReplacements`),
 * which provides nothing and imports nothing - so the tooling below is not
 * merely switched off in production, it is not there.
 *
 * Why a replaced file rather than `if (flag)`: a class Angular has compiled
 * carries static initialisers, and a bundler keeps a class with those even
 * behind a dead branch. Replacing the file removes the import itself.
 */
export function provideDevTools(): Provider[] {
  return [
    MemoryLogSink,
    { provide: LOG_SINKS, useExisting: MemoryLogSink, multi: true },
    { provide: LOG_INSPECTION, useExisting: MemoryLogSink },
  ];
}
