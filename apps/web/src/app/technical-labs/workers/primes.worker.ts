/// <reference lib="webworker" />
import { countPrimes, type PrimeRequest, type PrimeResponse } from './primes';

/**
 * The worker side of the workers lab: receives a limit, counts, answers.
 *
 * It runs on its own thread with its own event loop, so however long the
 * count takes, the page stays responsive. What it cannot do is touch the
 * page: no DOM, no Angular, no injector - only messages, which are copied
 * (structured clone) on the way in and out.
 */
addEventListener('message', ({ data }: MessageEvent<PrimeRequest>) => {
  const started = performance.now();
  const count = countPrimes(data.limit);
  postMessage({ count, computeMs: performance.now() - started } satisfies PrimeResponse);
});
