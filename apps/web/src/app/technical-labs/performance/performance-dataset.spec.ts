import { filterRows, generateDataset, summarize } from './performance-dataset';
import { IMAGE_WIDTHS, labImageLoader } from './image-demo';

describe('performance dataset', () => {
  it('is deterministic, so a measurement repeated tomorrow sees the same rows', () => {
    expect(generateDataset(50)).toEqual(generateDataset(50));
    expect(generateDataset(3).map((row) => row.code)).toEqual(['R-000001', 'R-000002', 'R-000003']);
  });

  it('filters by name or code, case-insensitively', () => {
    const rows = generateDataset(1_000);
    const fragment = rows[5].name.slice(0, 6);
    const byName = filterRows(rows, fragment.toUpperCase());
    expect(byName.length).toBeGreaterThan(0);
    expect(byName.every((row) => row.name.includes(fragment))).toBe(true);
    expect(filterRows(rows, 'r-000010').map((row) => row.code)).toContain('R-000010');
    expect(filterRows(rows, '  ')).toHaveLength(1_000);
  });

  it('summarizes every row in one pass', () => {
    const rows = generateDataset(100);
    const summary = summarize(rows);
    expect(summary.count).toBe(100);
    expect(summary.totalCents).toBe(rows.reduce((sum, row) => sum + row.amountCents, 0));
    expect(Object.values(summary.byRegion).reduce((a, b) => a + b, 0)).toBe(summary.totalCents);
  });
});

describe('labImageLoader', () => {
  it('picks the smallest generated file at least as wide as requested', () => {
    expect(labImageLoader({ src: '3', width: 256 })).toBe('/labs/images/photo-400.webp?item=3');
    expect(labImageLoader({ src: '3', width: 640 })).toBe('/labs/images/photo-800.webp?item=3');
    expect(labImageLoader({ src: '3', width: 3000 })).toBe('/labs/images/photo-1600.webp?item=3');
    expect(IMAGE_WIDTHS).toEqual([400, 800, 1600]);
  });
});
