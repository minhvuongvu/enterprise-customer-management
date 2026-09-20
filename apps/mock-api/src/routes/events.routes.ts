import type { RealtimeEvent } from '@ecm/contracts';
import { Router } from 'express';
import type { MockStore } from '../domain/store.ts';
import { requireAuth } from '../middleware/auth.ts';

/**
 * Server-sent events.
 *
 * SSE rather than WebSocket because every event here travels one way, and SSE
 * gives reconnection and event ids for free from the browser. ADR-0006 records
 * the comparison.
 *
 * Two details that matter to the client:
 *
 *  - Each event carries an `id`. On reconnect the browser resends the last one
 *    as `Last-Event-ID`, and a client that tracks what it has applied can drop
 *    duplicates. Duplicate delivery is normal here, not a bug.
 *  - A comment heartbeat keeps proxies from closing an idle connection. Without
 *    it, a connection that looks fine simply stops delivering.
 */
export function eventRoutes(store: MockStore): Router {
  const router = Router();

  const HEARTBEAT_MS = 15_000;

  router.get('/', requireAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Tells nginx not to buffer, which would otherwise hold events until the
    // buffer filled and make the stream look broken.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // An immediate comment makes the connection usable right away, so a client
    // is not left wondering whether it connected.
    res.write(': connected\n\n');

    const send = (event: RealtimeEvent): void => {
      res.write(`id: ${event.id}\n`);
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const unsubscribe = store.subscribe(send);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), HEARTBEAT_MS);

    // Without this the store keeps a reference to a dead response for every
    // tab that was ever opened.
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return router;
}
