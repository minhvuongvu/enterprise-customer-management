import { inject, Injectable } from '@angular/core';
import { isAppError } from '../errors/app-error';
import { Logger } from '../logging/logger';

/**
 * Error tracking seam.
 *
 * What an error-tracking service (Sentry, Bugsnag, Application Insights)
 * offers the application, reduced to the two calls the application makes:
 * record what led up to a failure, and report the failure with it. The
 * implementation here writes to the log. Adopting a vendor is one class and
 * one provider (`provideObservability`), with no call site changing - which is
 * the only reason for the abstraction, and the reason it is not deeper
 * (ADR-0039).
 */

/** Something that happened before an error, for the error report's context. */
export interface Breadcrumb {
  readonly at: string;
  readonly category: 'navigation' | 'interaction' | 'http';
  readonly message: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

/**
 * Provided in root with the logging implementation, so every injector - a
 * component test's included - has one. A vendor replaces it with one
 * provider in `provideObservability()`.
 */
@Injectable({ providedIn: 'root', useFactory: () => new LoggingErrorTracker() })
export abstract class ErrorTracker {
  /** Report an error that escaped the code that should have handled it. */
  abstract captureError(error: unknown): void;
  /** Remember a step, so the next error report shows how the user got there. */
  abstract addBreadcrumb(breadcrumb: Omit<Breadcrumb, 'at'>): void;
}

/** A bug report is useful with the last few steps; with fifty it is noise. */
const MAX_BREADCRUMBS = 20;
/**
 * The same error reported again inside this window is counted, not logged.
 * An error inside a change-detection loop fires sixty times a second, and a
 * tracker that forwards all of them buries every other error - and, with a
 * paid service, the quota.
 */
const REPEAT_WINDOW_MS = 10_000;

@Injectable()
export class LoggingErrorTracker extends ErrorTracker {
  private readonly logger = inject(Logger);
  private readonly breadcrumbs: Breadcrumb[] = [];
  private readonly lastReported = new Map<string, { at: number; suppressed: number }>();

  addBreadcrumb(breadcrumb: Omit<Breadcrumb, 'at'>): void {
    this.breadcrumbs.push({ ...breadcrumb, at: new Date().toISOString() });
    if (this.breadcrumbs.length > MAX_BREADCRUMBS) {
      this.breadcrumbs.shift();
    }
  }

  captureError(error: unknown): void {
    const report = describe(error);
    const now = Date.now();
    const previous = this.lastReported.get(report.fingerprint);
    if (previous && now - previous.at < REPEAT_WINDOW_MS) {
      previous.suppressed += 1;
      return;
    }
    this.lastReported.set(report.fingerprint, { at: now, suppressed: 0 });

    this.logger.error(report.message, {
      ...report.fields,
      fingerprint: report.fingerprint,
      repeatsSuppressed: previous?.suppressed ?? 0,
      // Copied, so a later breadcrumb does not rewrite this report.
      breadcrumbs: [...this.breadcrumbs],
    });
  }
}

interface ErrorReport {
  readonly message: string;
  /** Groups occurrences of one defect, the way a tracker's issue list does. */
  readonly fingerprint: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

function describe(error: unknown): ErrorReport {
  if (isAppError(error)) {
    // Already classified closer to the cause - keep the taxonomy. The
    // server's message is not in an `AppError`, and is not wanted here.
    return {
      message: 'Unhandled application error',
      fingerprint: `app:${error.kind}:${error.messageKey}`,
      fields: {
        kind: error.kind,
        messageKey: error.messageKey,
        status: error.status,
        correlationId: error.correlationId,
      },
    };
  }
  if (error instanceof Error) {
    const firstFrame = error.stack?.split('\n')[1]?.trim() ?? '';
    return {
      message: 'Unhandled error',
      fingerprint: `error:${error.name}:${firstFrame}`,
      fields: { error, stack: error.stack },
    };
  }
  return {
    message: 'Unhandled non-error value',
    fingerprint: `value:${typeof error}`,
    fields: { value: String(error) },
  };
}
