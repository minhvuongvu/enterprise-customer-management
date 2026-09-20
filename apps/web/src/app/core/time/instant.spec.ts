import { dateOnlyParts, formatDateOnly, parseDateOnly, parseInstant, toInstant } from './instant';

describe('time policy', () => {
  describe('parseInstant', () => {
    it('normalises equivalent spellings to a single canonical form', () => {
      const withOffset = parseInstant('2026-09-20T11:00:00+07:00');
      const asUtc = parseInstant('2026-09-20T04:00:00.000Z');

      expect(withOffset).toBe('2026-09-20T04:00:00.000Z');
      expect(withOffset).toBe(asUtc);
    });

    it('returns null for a malformed timestamp instead of throwing', () => {
      expect(parseInstant('not a timestamp')).toBeNull();
    });
  });

  describe('toInstant', () => {
    it('always produces UTC regardless of the machine timezone', () => {
      expect(toInstant(new Date(Date.UTC(2026, 8, 20, 4, 0, 0)))).toBe('2026-09-20T04:00:00.000Z');
    });
  });

  describe('parseDateOnly', () => {
    it('accepts a calendar date', () => {
      expect(parseDateOnly('1990-01-01')).toBe('1990-01-01');
    });

    it('rejects a date that does not exist rather than rolling it over', () => {
      // `new Date('2026-02-30')` silently becomes 2026-03-02.
      expect(parseDateOnly('2026-02-30')).toBeNull();
    });

    it('rejects a timestamp, because a date-only value has no time', () => {
      expect(parseDateOnly('1990-01-01T00:00:00Z')).toBeNull();
    });
  });

  describe('formatDateOnly', () => {
    it('renders the day it says, whatever the viewer timezone is', () => {
      const dateOfBirth = parseDateOnly('1990-01-01');
      const rendered = formatDateOnly(dateOfBirth!, 'en-GB');

      // The failure this guards against renders 31 December 1989 anywhere
      // west of UTC - which is the bug the whole DateOnly type exists for.
      expect(rendered).toContain('1990');
      expect(rendered).toContain('1');
      expect(rendered).not.toContain('1989');
    });

    it('follows the locale it is asked for', () => {
      const date = parseDateOnly('2026-03-05');
      expect(formatDateOnly(date!, 'en-GB')).toContain('March');
    });
  });

  describe('dateOnlyParts', () => {
    it('does not shift the day, which is the whole point of the type', () => {
      // The bug this guards against: in any negative UTC offset,
      // `new Date('1990-01-01').getDate()` is 31, and the birthday moves.
      const dateOfBirth = parseDateOnly('1990-01-01');
      expect(dateOfBirth).not.toBeNull();

      expect(dateOnlyParts(dateOfBirth!)).toEqual({ year: 1990, month: 1, day: 1 });
    });
  });
});
