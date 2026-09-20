import { randomUUID } from 'node:crypto';
import type { Instant } from '@ecm/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { MockApiConfig, MockControls } from '../config.ts';
import type { MockStore } from '../domain/store.ts';
import { parseOrThrow } from '../http/validate.ts';
import { MOCK_SCENARIOS } from '../middleware/fault-injection.ts';

/**
 * Control surface for the mock itself, under `/api/_mock`.
 *
 * Not part of the API contract - a real backend has no such endpoints, and
 * `@ecm/contracts` deliberately does not describe them. The underscore keeps
 * that visible in every URL.
 *
 * Unauthenticated on purpose: tests use it to arrange state before signing in,
 * and it only exists in a process that must never be deployed. That claim is
 * load-bearing, so docs/mock-backend.md states it plainly.
 */
export function adminRoutes(
  store: MockStore,
  controls: MockControls,
  config: MockApiConfig,
): Router {
  const router = Router();

  router.get('/scenarios', (_req, res) => {
    // Served rather than only documented, so the list cannot drift from the
    // code: this is the same array the middleware dispatches on.
    res.status(200).json({ header: 'x-mock-scenario', scenarios: MOCK_SCENARIOS });
  });

  router.get('/controls', (_req, res) => {
    res.status(200).json({ ...controls, customerCount: store.size, seed: config.seed });
  });

  const controlsPatchSchema = z.strictObject({
    latencyMs: z.number().min(0).max(30_000).optional(),
    jitterMs: z.number().min(0).max(30_000).optional(),
    errorRatePercent: z.number().min(0).max(100).optional(),
  });

  router.patch('/controls', (req, res) => {
    const patch = parseOrThrow(controlsPatchSchema, req.body, 'mock controls');
    Object.assign(controls, patch);
    res.status(200).json(controls);
  });

  const reseedSchema = z.strictObject({
    seed: z.int().optional(),
    count: z.int().min(0).max(200_000).optional(),
  });

  router.post('/reseed', (req, res) => {
    const request = parseOrThrow(reseedSchema, req.body ?? {}, 'reseed request');
    const seed = request.seed ?? config.seed;
    const count = request.count ?? store.size;
    store.reseed(seed, count);
    res.status(200).json({ seed, count: store.size });
  });

  const noticeSchema = z.strictObject({ messageKey: z.string().min(1).max(200) });

  /** Publishes a system notice, so the SSE stream can be tested on demand. */
  router.post('/notice', (req, res) => {
    const { messageKey } = parseOrThrow(noticeSchema, req.body, 'notice');
    store.publish({
      type: 'system.notice',
      id: randomUUID(),
      at: new Date().toISOString() as Instant,
      messageKey,
    });
    res.status(202).end();
  });

  return router;
}
