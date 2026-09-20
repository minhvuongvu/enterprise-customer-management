import type { Request, RequestHandler } from 'express';
import { ApiError } from '../http/api-error.ts';

/**
 * Deterministic failure injection.
 *
 * A mock that fails randomly produces flaky tests, and a flaky test teaches
 * people to re-run rather than to look. So failures are *requested*: the client
 * sends `x-mock-scenario: conflict` and gets exactly that, every time.
 *
 * Random failure still exists, as `MockControls.errorRatePercent`, for
 * demonstrating resilience by hand. It is off by default and tests never use it.
 */
export const MOCK_SCENARIO_HEADER = 'x-mock-scenario';

/**
 * Where a scenario takes effect.
 *
 * `transport` scenarios are applied by this middleware before routing, because
 * they are about the request never succeeding. `handler` scenarios need domain
 * context - which record, which user - so the route that owns that context
 * reads them.
 */
export interface ScenarioDefinition {
  readonly name: string;
  readonly appliedBy: 'transport' | 'handler';
  readonly description: string;
}

export const MOCK_SCENARIOS: readonly ScenarioDefinition[] = [
  { name: 'slow', appliedBy: 'transport', description: 'Adds 3 seconds before responding.' },
  { name: 'server-error', appliedBy: 'transport', description: 'Responds 500 INTERNAL_ERROR.' },
  {
    name: 'network-drop',
    appliedBy: 'transport',
    description:
      'Destroys the connection with no response - the client sees a network failure, not an HTTP status.',
  },
  { name: 'unauthorized', appliedBy: 'transport', description: 'Responds 401 UNAUTHENTICATED.' },
  { name: 'forbidden', appliedBy: 'transport', description: 'Responds 403 FORBIDDEN.' },
  { name: 'not-found', appliedBy: 'transport', description: 'Responds 404 NOT_FOUND.' },
  {
    name: 'validation-error',
    appliedBy: 'transport',
    description: 'Responds 422 VALIDATION_FAILED with a sample field error.',
  },
  {
    name: 'rate-limit',
    appliedBy: 'transport',
    description: 'Responds 429 RATE_LIMITED with Retry-After: 30.',
  },
  {
    name: 'payload-too-large',
    appliedBy: 'transport',
    description: 'Responds 413 PAYLOAD_TOO_LARGE.',
  },
  {
    name: 'conflict',
    appliedBy: 'handler',
    description: 'A versioned write responds 409 CONFLICT as though another user had just saved.',
  },
  {
    name: 'invalid-credentials',
    appliedBy: 'handler',
    description: 'Login responds 401 even for a known username.',
  },
  {
    name: 'expired-session',
    appliedBy: 'handler',
    description:
      'The access cookie is treated as expired, so protected routes respond 401 and the client must refresh.',
  },
  {
    name: 'partial-bulk-failure',
    appliedBy: 'handler',
    description: 'Every second id in a bulk request fails, so partial success has to be handled.',
  },
  {
    name: 'import-partial-failure',
    appliedBy: 'handler',
    description: 'Every third CSV row fails validation regardless of its content.',
  },
];

const BY_NAME = new Map(MOCK_SCENARIOS.map((scenario) => [scenario.name, scenario]));

/** The scenario requested for this request, if any. Used by route handlers. */
export function scenarioOf(req: Request): string | null {
  const requested = req.get(MOCK_SCENARIO_HEADER);
  return requested && BY_NAME.has(requested) ? requested : null;
}

export function hasScenario(req: Request, name: string): boolean {
  return scenarioOf(req) === name;
}

const SLOW_DELAY_MS = 3000;

export const faultInjection: RequestHandler = (req, res, next) => {
  const requested = req.get(MOCK_SCENARIO_HEADER);
  if (!requested) {
    next();
    return;
  }

  const scenario = BY_NAME.get(requested);
  if (!scenario) {
    // An unknown scenario is a typo in a test. Failing loudly beats silently
    // running the happy path and reporting a pass.
    next(new ApiError('BAD_REQUEST', `Unknown mock scenario "${requested}".`));
    return;
  }

  if (scenario.appliedBy === 'handler') {
    next();
    return;
  }

  switch (scenario.name) {
    case 'slow':
      setTimeout(next, SLOW_DELAY_MS);
      return;
    case 'network-drop':
      // No status, no body: this is what being offline looks like to a client,
      // and it is the case a try/catch around fetch has to cover.
      req.socket.destroy();
      return;
    case 'server-error':
      next(new ApiError('INTERNAL_ERROR', 'Injected failure.'));
      return;
    case 'unauthorized':
      next(new ApiError('UNAUTHENTICATED', 'Injected authentication failure.'));
      return;
    case 'forbidden':
      next(new ApiError('FORBIDDEN', 'Injected authorization failure.'));
      return;
    case 'not-found':
      next(new ApiError('NOT_FOUND', 'Injected not-found.'));
      return;
    case 'validation-error':
      next(
        new ApiError('VALIDATION_FAILED', 'Injected validation failure.', {
          fieldErrors: { email: ['Injected validation failure.'] },
        }),
      );
      return;
    case 'rate-limit':
      res.setHeader('Retry-After', '30');
      next(new ApiError('RATE_LIMITED', 'Injected rate limit.', { retryAfterSeconds: 30 }));
      return;
    case 'payload-too-large':
      next(new ApiError('PAYLOAD_TOO_LARGE', 'Injected payload limit.'));
      return;
    default:
      next();
  }
};
