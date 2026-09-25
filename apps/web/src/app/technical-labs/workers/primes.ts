/**
 * Counts the primes up to `limit` with the sieve of Eratosthenes.
 *
 * Chosen for the worker demo because it is pure CPU - no I/O, nothing to
 * await - and its cost is easy to dial: twenty million takes long enough on
 * the main thread to freeze every animation on the page. Shared by the
 * worker and the main-thread run, so both do exactly the same work.
 */
export function countPrimes(limit: number): number {
  if (limit < 2) {
    return 0;
  }
  const composite = new Uint8Array(limit + 1);
  let count = 0;
  for (let candidate = 2; candidate <= limit; candidate++) {
    if (composite[candidate]) {
      continue;
    }
    count++;
    for (let multiple = candidate * candidate; multiple <= limit; multiple += candidate) {
      composite[multiple] = 1;
    }
  }
  return count;
}

/** What the worker is asked, and what it answers. The only protocol between them. */
export interface PrimeRequest {
  readonly limit: number;
}

export interface PrimeResponse {
  readonly count: number;
  /** Measured inside the worker - the computation alone, no messaging. */
  readonly computeMs: number;
}
