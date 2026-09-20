import { randomUUID } from 'node:crypto';
import { CORRELATION_ID_HEADER } from '@ecm/contracts';
import type { RequestHandler } from 'express';

/**
 * Joins this server's logs to the browser's.
 *
 * The client generates an id and sends it; we reuse it rather than inventing a
 * second one, and echo it back on the response. One id therefore covers the
 * click, the request, the server's handling and the error the user reported.
 * A request that arrives without one still gets an id, so nothing is
 * untraceable.
 */
export const correlationId: RequestHandler = (req, res, next) => {
  const incoming = req.get(CORRELATION_ID_HEADER);
  req.correlationId = incoming && incoming.length <= 200 ? incoming : randomUUID();
  res.setHeader(CORRELATION_ID_HEADER, req.correlationId);
  next();
};
