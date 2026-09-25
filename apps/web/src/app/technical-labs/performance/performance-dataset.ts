/**
 * The performance lab's large dataset: generated in the browser, never fetched.
 *
 * The lab measures rendering and computation, so the data must not cost a
 * network request whose variance would swamp the numbers - and the mock API's
 * 50,000 customers are paged at 100 for good reasons that do not apply here.
 * Deterministic, so a measurement repeated tomorrow sees the same rows.
 */
export interface DatasetRow {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly region: DatasetRegion;
  readonly amountCents: number;
}

export const DATASET_REGIONS = ['north', 'south', 'east', 'west'] as const;
export type DatasetRegion = (typeof DATASET_REGIONS)[number];

/** Syllables, so names are searchable and not all alike. Data, not copy. */
const SYLLABLES = ['an', 'bel', 'cor', 'dan', 'el', 'fin', 'gar', 'hal', 'is', 'jor', 'ka', 'lin'];

export const DATASET_SIZE = 100_000;

export function generateDataset(count = DATASET_SIZE): DatasetRow[] {
  const rows: DatasetRow[] = new Array(count);
  for (let index = 0; index < count; index++) {
    const a = SYLLABLES[index % SYLLABLES.length];
    const b = SYLLABLES[(index * 7) % SYLLABLES.length];
    const c = SYLLABLES[(index * 13) % SYLLABLES.length];
    rows[index] = {
      id: index + 1,
      code: `R-${String(index + 1).padStart(6, '0')}`,
      name: `${a}${b} ${c}${a}`,
      region: DATASET_REGIONS[(index * 3) % DATASET_REGIONS.length],
      amountCents: (index * 7919) % 1_000_000,
    };
  }
  return rows;
}

/** A plain linear scan - the work debouncing saves, run once per keystroke otherwise. */
export function filterRows(rows: readonly DatasetRow[], query: string): DatasetRow[] {
  const needle = query.trim().toLowerCase();
  return needle
    ? rows.filter((row) => row.name.includes(needle) || row.code.includes(needle.toUpperCase()))
    : [...rows];
}

export interface DatasetSummary {
  readonly count: number;
  readonly totalCents: number;
  readonly byRegion: Readonly<Record<DatasetRegion, number>>;
}

/** Derived state worth memoizing: one pass over every row. */
export function summarize(rows: readonly DatasetRow[]): DatasetSummary {
  const byRegion: Record<DatasetRegion, number> = { north: 0, south: 0, east: 0, west: 0 };
  let totalCents = 0;
  for (const row of rows) {
    totalCents += row.amountCents;
    byRegion[row.region] += row.amountCents;
  }
  return { count: rows.length, totalCents, byRegion };
}
