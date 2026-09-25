/**
 * The rendering lab's specimens: one page, served five ways.
 *
 * The page is identical in every specimen - same component, same data, same
 * bytes of JavaScript - so that a difference in a measurement is a difference
 * in *how it was rendered* and nothing else. The server-side half of each
 * definition is in `app.routes.server.ts`, which is where Angular requires it;
 * this list is what that file, the specimen routes and the lab page share, so
 * the three cannot drift.
 *
 * The specimens are public routes outside the shell, and that is deliberate
 * (ADR-0026): server-rendering an authenticated page would need the session on
 * the server, which is exactly what ANGULAR_PROJECT_CONTEXT.md §5.6 rules out.
 * They show no data from the API, only generated rows.
 */
export type SpecimenId =
  'client' | 'server' | 'prerender' | 'prerender-no-hydration' | 'prerender-incremental';

/** What happens to the server's HTML - if there is any - once the JavaScript arrives. */
export type SpecimenHydration = 'none' | 'full' | 'destructive' | 'incremental';

export interface RenderingSpecimen {
  readonly id: SpecimenId;
  /** Where the HTML comes from: nowhere, each request, or the build. */
  readonly source: 'client' | 'server' | 'build';
  readonly hydration: SpecimenHydration;
}

export const SPECIMEN_BASE_PATH = 'rendering-lab';

export const RENDERING_SPECIMENS: readonly RenderingSpecimen[] = [
  { id: 'client', source: 'client', hydration: 'none' },
  { id: 'server', source: 'server', hydration: 'full' },
  { id: 'prerender', source: 'build', hydration: 'full' },
  { id: 'prerender-no-hydration', source: 'build', hydration: 'destructive' },
  { id: 'prerender-incremental', source: 'build', hydration: 'incremental' },
];

export function specimenPath(id: SpecimenId): string {
  return `/${SPECIMEN_BASE_PATH}/${id}`;
}

/** Rows in the catalogue - enough DOM for hydration to cost something measurable. */
export const SPECIMEN_ROW_COUNT = 400;

export const SPECIMEN_CATEGORIES = ['hardware', 'software', 'services', 'training'] as const;
export type SpecimenCategory = (typeof SPECIMEN_CATEGORIES)[number];

export interface SpecimenRow {
  readonly code: string;
  readonly category: SpecimenCategory;
  readonly quantity: number;
  readonly amountCents: number;
}

/**
 * Deterministic rows. The server and the browser must produce the same ones,
 * or hydration finds a DOM that does not match its template - so no
 * `Math.random()`, no clock.
 */
export function specimenRows(count = SPECIMEN_ROW_COUNT): SpecimenRow[] {
  return Array.from({ length: count }, (_, index) => ({
    code: `SPC-${String(index + 1).padStart(4, '0')}`,
    category: SPECIMEN_CATEGORIES[index % SPECIMEN_CATEGORIES.length],
    quantity: (index * 7) % 50,
    amountCents: ((index * 7919) % 100_000) + 100,
  }));
}
