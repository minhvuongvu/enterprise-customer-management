import type { RequestHandler } from 'express';
import type { MockControls } from '../config.ts';
import { ApiError } from '../http/api-error.ts';
import { scenarioOf } from './fault-injection.ts';

/**
 * Artificial latency and optional random failure.
 *
 * A mock that answers in one millisecond hides every loading state, every race
 * and every cancellation bug the frontend is supposed to handle. The default
 * delay is small enough not to be annoying and large enough to be visible.
 *
 * Latency is skipped when a scenario is requested: a test asking for `conflict`
 * wants the conflict, not the wait.
 */
export function simulatedLatency(controls: MockControls): RequestHandler {
  return (req, _res, next) => {
    if (scenarioOf(req)) {
      next();
      return;
    }

    if (controls.errorRatePercent > 0 && Math.random() * 100 < controls.errorRatePercent) {
      next(
        new ApiError(
          'INTERNAL_ERROR',
          'Randomly injected failure (MockControls.errorRatePercent).',
        ),
      );
      return;
    }

    const delay = controls.latencyMs + Math.random() * controls.jitterMs;
    if (delay <= 0) {
      next();
      return;
    }
    setTimeout(next, delay);
  };
}
