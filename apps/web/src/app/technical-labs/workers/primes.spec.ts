import { countPrimes } from './primes';

describe('countPrimes', () => {
  it('counts the primes up to and including the limit', () => {
    expect(countPrimes(1)).toBe(0);
    expect(countPrimes(2)).toBe(1);
    expect(countPrimes(10)).toBe(4);
    expect(countPrimes(100)).toBe(25);
    expect(countPrimes(1_000_000)).toBe(78_498);
  });
});
