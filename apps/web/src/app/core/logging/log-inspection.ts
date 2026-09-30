import { InjectionToken, type Signal } from '@angular/core';
import type { LogEntry } from './logger';

/**
 * Read access to recent log entries, for developer tooling.
 *
 * `null` unless the build includes developer tooling (`dev-tools.providers.ts`,
 * ADR-0040). A reader - the observability lab - must handle `null`, and says
 * "not in this build" rather than showing an empty table.
 */
export interface LogInspection {
  readonly entries: Signal<readonly LogEntry[]>;
  clear(): void;
}

export const LOG_INSPECTION = new InjectionToken<LogInspection | null>('ecm.logInspection', {
  providedIn: 'root',
  factory: () => null,
});
