import { Injectable, signal } from '@angular/core';
import type { LogInspection } from './log-inspection';
import type { LogEntry, LogSink } from './logger';

/** Enough to see what just happened; small enough to never matter. */
const CAPACITY = 200;

/**
 * Keeps the latest entries in memory, as a signal.
 *
 * The observability lab reads it (as `LOG_INSPECTION`) to show the log live,
 * next to the action that produced it. Registered only by
 * `dev-tools.providers.ts`, which a production build replaces with an empty
 * file (angular.json `fileReplacements`, ADR-0040) - so nothing imports this
 * class there, and it is not in the bundle. `perf/check-budgets.ts` fails the
 * build if it ever is.
 *
 * Entries arrive already redacted - the logger redacts before any sink.
 */
@Injectable()
export class MemoryLogSink implements LogSink, LogInspection {
  private readonly buffer = signal<readonly LogEntry[]>([]);

  readonly entries = this.buffer.asReadonly();

  write(entry: LogEntry): void {
    this.buffer.update((entries) => [...entries.slice(-(CAPACITY - 1)), entry]);
  }

  clear(): void {
    this.buffer.set([]);
  }
}
