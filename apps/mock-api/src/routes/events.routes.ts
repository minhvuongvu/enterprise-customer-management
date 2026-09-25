import {
  CSRF_COOKIE_NAME,
  LAST_EVENT_ID_HEADER,
  LAST_EVENT_ID_PARAM,
  RESYNC_EVENT,
  type RealtimeEvent,
} from '@ecm/contracts';
import { Router } from 'express';
import type { EventStreams } from '../domain/event-streams.ts';
import type { MockStore } from '../domain/store.ts';
import { requireAuth } from '../middleware/auth.ts';

/**
 * Server-sent events.
 *
 * SSE rather than WebSocket because every event here travels one way, and SSE
 * gives reconnection and event ids for free from the browser. ADR-0006 records
 * the comparison; ADR-0020 the client that consumes it.
 *
 * Three details that matter to the client:
 *
 *  - Each event carries an `id`. A reconnecting client names the last one it
 *    saw - the browser sends `Last-Event-ID` itself; a client that opened a
 *    new stream sends `?lastEventId=` - and receives what it missed from a
 *    short replay buffer. Replay overlaps what the client may already have, so
 *    **duplicate delivery is normal here**, and the client de-duplicates by id.
 *  - An id the buffer no longer holds gets no replay. A `resync` event says so,
 *    and the client revalidates instead of trusting a partial history.
 *  - A comment heartbeat keeps proxies from closing an idle connection.
 */
export function eventRoutes(store: MockStore, streams: EventStreams): Router {
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

    const lastEventId =
      req.get(LAST_EVENT_ID_HEADER) ??
      (typeof req.query[LAST_EVENT_ID_PARAM] === 'string' ? req.query[LAST_EVENT_ID_PARAM] : '');
    if (lastEventId) {
      const missed = store.eventsAfter(lastEventId);
      if (missed === null) {
        res.write(`event: ${RESYNC_EVENT}\ndata: {}\n\n`);
      } else {
        missed.forEach(send);
      }
    }

    const unsubscribe = store.subscribe(send);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), HEARTBEAT_MS);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
      unregister();
    };
    const unregister = streams.register(
      () => {
        cleanup();
        res.end();
      },
      (req.cookies?.[CSRF_COOKIE_NAME] as string | undefined) ?? '',
    );

    // Without this the store keeps a reference to a dead response for every
    // tab that was ever opened.
    req.on('close', cleanup);
  });

  return router;
}
