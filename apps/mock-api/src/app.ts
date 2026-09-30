import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import { defaultControls, loadConfig, type MockApiConfig, type MockControls } from './config.ts';
import { EventStreams } from './domain/event-streams.ts';
import { MockApiLogger } from './logging/logger.ts';
import { SessionRegistry } from './domain/sessions.ts';
import { MockStore } from './domain/store.ts';
import { authenticate } from './middleware/auth.ts';
import { correlationId } from './middleware/correlation-id.ts';
import { cors } from './middleware/cors.ts';
import { errorHandler, notFoundHandler } from './middleware/error-handler.ts';
import { faultInjection } from './middleware/fault-injection.ts';
import { simulatedLatency } from './middleware/latency.ts';
import { rateLimit } from './middleware/rate-limit.ts';
import { requestLog } from './middleware/request-log.ts';
import { securityHeaders } from './middleware/security-headers.ts';
import { adminRoutes } from './routes/admin.routes.ts';
import { authRoutes } from './routes/auth.routes.ts';
import { customerRoutes } from './routes/customers.routes.ts';
import { eventRoutes } from './routes/events.routes.ts';
import { fileRoutes } from './routes/files.routes.ts';

/**
 * Builds the server.
 *
 * Exported separately from `main.ts` so tests can start it on an ephemeral port
 * with their own configuration - a small dataset, no latency - and still
 * exercise the real HTTP stack: real cookies, real headers, real status codes.
 * Testing an Express app in-process without a socket would skip exactly the
 * parts this server exists to provide.
 */

export interface BuiltServer {
  readonly app: Express;
  readonly store: MockStore;
  readonly sessions: SessionRegistry;
  readonly streams: EventStreams;
  readonly controls: MockControls;
  readonly config: MockApiConfig;
  readonly logger: MockApiLogger;
}

/**
 * `writeLogs` is false in the unit tests: they read the logger's buffer
 * instead, and a suite that provokes failures on purpose would otherwise print
 * every one of them.
 */
export function createApp(overrides: Partial<MockApiConfig> = {}, writeLogs = true): BuiltServer {
  const config: MockApiConfig = { ...loadConfig(), ...overrides };
  const logger = new MockApiLogger({ level: config.logLevel, stdout: writeLogs, bufferSize: 5000 });
  const controls = defaultControls();
  const store = new MockStore(config.seed, config.customerCount);
  const sessions = new SessionRegistry(config.accessTtlSeconds, config.refreshTtlSeconds);
  const streams = new EventStreams();

  const app = express();

  // Behind a proxy in the dev setup, so req.ip must come from the forwarded
  // header rather than from the socket - otherwise the rate limiter sees one
  // client.
  app.set('trust proxy', true);
  // Nothing here needs to advertise what it runs on.
  app.disable('x-powered-by');

  // Order matters and is the reason these are listed here rather than spread
  // across the route files:
  //   1. a correlation id, so everything after it can be traced - and the
  //      request log right after it, so every response is logged with it;
  //   2. CORS, which must answer a preflight before anything else runs;
  //   3. security headers on every response, including error responses;
  //   4. body and cookie parsing;
  //   5. fault injection, so an injected failure skips the real work;
  //   6. latency, which the scenarios deliberately bypass;
  //   7. rate limiting;
  //   8. session resolution, so routes can ask who is calling.
  app.use(correlationId);
  app.use(requestLog(logger));
  app.use(cors(config.corsOrigins));
  app.use(securityHeaders);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(faultInjection);
  app.use(simulatedLatency(controls));
  app.use(rateLimit(config.rateLimitPerMinute));
  app.use(authenticate(sessions));

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok', customers: store.size, seed: config.seed });
  });

  app.use('/api/_mock', adminRoutes(store, controls, config, streams, logger));
  app.use('/api/auth', authRoutes(sessions, config));
  // Mounted before the customer router so `/api/customers/export` is not
  // swallowed by `/:id`.
  app.use('/api/customers', fileRoutes(store));
  app.use('/api/customers', customerRoutes(store));
  app.use('/api/events', eventRoutes(store, streams));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return { app, store, sessions, streams, controls, config, logger };
}
