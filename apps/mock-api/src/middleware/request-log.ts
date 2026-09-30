import { endpointTemplate } from '@ecm/contracts';
import type { RequestHandler } from 'express';
import type { MockApiLogger } from '../logging/logger.ts';

/**
 * One log line per request, written when the response is finished.
 *
 * The server-side half of the browser's request log
 * (`core/http/request-logging.interceptor.ts`): the same correlation id, the
 * same field names. Searching either log for one id returns both lines.
 *
 * What is logged is the **route template** (`/api/customers/:id`), not the URL:
 * the template groups requests for latency figures, and the URL's query string
 * is where a search for a person's name would otherwise end up. Bodies and
 * headers are never logged.
 *
 * Levels: a 5xx is `error` - the server failed. A 4xx is `info`: a 404 or a
 * 409 is this API working as designed, and an alert on it would be noise.
 */
export function requestLog(logger: MockApiLogger): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    let written = false;

    const write = (outcome: 'completed' | 'aborted') => {
      if (written) {
        return;
      }
      written = true;
      const durationMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
      const fields = {
        correlationId: req.correlationId,
        method: req.method,
        // The template, from the shared helper the browser's log uses too.
        route: endpointTemplate(req.originalUrl),
        status: res.statusCode,
        durationMs,
        userId: req.authUser?.id,
        role: req.authUser?.role,
      };
      if (outcome === 'aborted') {
        // The client went away first: a cancelled search, a closed tab, an
        // event stream ending. Normal traffic.
        logger.debug('HTTP request aborted by the client', fields);
      } else if (res.statusCode >= 500) {
        logger.error('HTTP request failed', fields);
      } else {
        logger.info('HTTP request completed', fields);
      }
    };

    res.on('finish', () => write('completed'));
    res.on('close', () => write('aborted'));
    next();
  };
}
