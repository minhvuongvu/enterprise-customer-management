/**
 * Configuration and the mutable controls tests and demos use to steer the mock.
 *
 * Two different things on purpose: `MockApiConfig` is fixed at startup, while
 * `MockControls` can be changed at runtime through the admin routes. Latency and
 * error injection need to be adjustable without restarting; a port does not.
 */

export interface MockApiConfig {
  readonly port: number;
  /** Seeds the dataset. The same seed always produces the same customers. */
  readonly seed: number;
  readonly customerCount: number;
  /** Origins allowed to send credentialed requests. Never `*` - see cors.ts. */
  readonly corsOrigins: readonly string[];
  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;
  readonly rateLimitPerMinute: number;
  /**
   * `Secure` on session cookies. Off for plain-HTTP local development, on
   * everywhere else - a Secure cookie is simply dropped over http://.
   */
  readonly secureCookies: boolean;
}

export interface MockControls {
  /** Added to every response. Makes loading states visible instead of theoretical. */
  latencyMs: number;
  /** Random jitter on top of the base latency. */
  jitterMs: number;
  /**
   * Percentage of requests failed with a 500.
   *
   * Zero by default. Random failure makes tests flaky, so tests use the
   * deterministic `x-mock-scenario` header instead - see fault-injection.ts.
   */
  errorRatePercent: number;
}

function intFromEnv(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, received "${raw}".`);
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): MockApiConfig {
  return {
    port: intFromEnv(env, 'MOCK_API_PORT', 4300),
    seed: intFromEnv(env, 'MOCK_API_SEED', 20260920),
    // Large enough that pagination, sorting and search cost something real,
    // which is what Phase 5 needs in order to measure anything.
    customerCount: intFromEnv(env, 'MOCK_API_CUSTOMERS', 50_000),
    corsOrigins: (env['MOCK_API_CORS_ORIGINS'] ?? 'http://localhost:4200').split(','),
    accessTtlSeconds: intFromEnv(env, 'MOCK_API_ACCESS_TTL', 15 * 60),
    refreshTtlSeconds: intFromEnv(env, 'MOCK_API_REFRESH_TTL', 8 * 60 * 60),
    rateLimitPerMinute: intFromEnv(env, 'MOCK_API_RATE_LIMIT', 600),
    secureCookies: env['MOCK_API_SECURE_COOKIES'] === 'true',
  };
}

export function defaultControls(env: NodeJS.ProcessEnv = process.env): MockControls {
  return {
    latencyMs: intFromEnv(env, 'MOCK_API_LATENCY_MS', 120),
    jitterMs: intFromEnv(env, 'MOCK_API_JITTER_MS', 80),
    errorRatePercent: intFromEnv(env, 'MOCK_API_ERROR_RATE', 0),
  };
}
