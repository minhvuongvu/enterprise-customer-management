import { isTabNote } from './cross-tab-lab';

describe('isTabNote', () => {
  it('accepts a note and nothing else a tab might post', () => {
    expect(isTabNote({ from: 'a', text: 'hi', at: '2026-09-25T10:00:00.000Z' })).toBe(true);
    expect(isTabNote({ from: 'a', text: 42, at: 'x' })).toBe(false);
    expect(isTabNote('hi')).toBe(false);
    expect(isTabNote(null)).toBe(false);
  });
});
