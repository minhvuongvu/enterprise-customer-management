import { ErrorHandler, inject, Injectable } from '@angular/core';
import { ErrorTracker } from '../observability/error-tracker';

/**
 * Last line of defence for anything that escapes a feature.
 *
 * It only reports - to the error tracker, which adds the steps that led here
 * and groups repeats (ADR-0039). Deciding what a user sees belongs to the
 * feature that knows the context; a global handler that also renders a toast
 * produces a second, meaningless message next to the real one.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly errors = inject(ErrorTracker);

  handleError(error: unknown): void {
    this.errors.captureError(error);
  }
}
