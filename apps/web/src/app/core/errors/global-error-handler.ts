import { ErrorHandler, inject, Injectable } from '@angular/core';
import { isAppError } from './app-error';
import { Logger } from '../logging/logger';

/**
 * Last line of defence for anything that escapes a feature.
 *
 * It only records. Deciding what a user sees belongs to the feature that knows
 * the context; a global handler that also renders a toast produces a second,
 * meaningless message next to the real one.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly logger = inject(Logger);

  handleError(error: unknown): void {
    if (isAppError(error)) {
      // Already classified somewhere closer to the cause - keep the taxonomy.
      this.logger.error('Unhandled application error', {
        kind: error.kind,
        messageKey: error.messageKey,
        status: error.status,
        correlationId: error.correlationId,
      });
      return;
    }

    this.logger.error('Unhandled error', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}
