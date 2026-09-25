import { RenderMode } from '@angular/ssr';
import { serverRoutes } from '../../app.routes.server';
import { readPageLoad } from './page-load-metrics';
import { RENDERING_SPECIMENS, specimenRows } from './rendering-specimens';

describe('rendering specimens', () => {
  it('declares each specimen with the render mode it claims', () => {
    const modeOf = (path: string) => serverRoutes.find((route) => route.path === path)?.renderMode;

    expect(modeOf('rendering-lab/client')).toBe(RenderMode.Client);
    expect(modeOf('rendering-lab/server')).toBe(RenderMode.Server);
    expect(modeOf('rendering-lab/prerender')).toBe(RenderMode.Prerender);
    expect(modeOf('rendering-lab/prerender-incremental')).toBe(RenderMode.Prerender);
    expect(RENDERING_SPECIMENS).toHaveLength(5);
  });

  it('keeps the authenticated application client-rendered (§5.6)', () => {
    expect(serverRoutes.at(-1)).toEqual({ path: '**', renderMode: RenderMode.Client });
  });

  it('generates the same rows on the server and in the browser', () => {
    // A difference would be a hydration mismatch.
    expect(specimenRows(20)).toEqual(specimenRows(20));
    expect(specimenRows().at(-1)?.code).toBe('SPC-0400');
  });
});

describe('readPageLoad', () => {
  it('reads each number from the browser entry that records it', () => {
    const entries: Record<string, object[]> = {
      navigation: [{ responseStart: 42, transferSize: 1_000 }],
      resource: [{ transferSize: 300 }, { transferSize: 700 }],
    };
    const byName: Record<string, object[]> = {
      'first-contentful-paint': [{ startTime: 120 }],
      'ecm:bootstrap-start': [{ startTime: 200 }],
      'ecm:app-stable': [{ startTime: 450 }],
    };
    const performance = {
      getEntriesByType: (type: string) => entries[type] ?? [],
      getEntriesByName: (name: string) => byName[name] ?? [],
    } as unknown as Performance;

    expect(readPageLoad(performance, 130)).toEqual({
      ttfb: 42,
      fcp: 120,
      lcp: 130,
      appStable: 450,
      bootstrapToStable: 250,
      htmlBytes: 1_000,
      totalBytes: 2_000,
    });
  });

  it('leaves what was not recorded as null, rather than zero', () => {
    const empty = {
      getEntriesByType: () => [],
      getEntriesByName: () => [],
    } as unknown as Performance;
    expect(readPageLoad(empty, null)).toEqual({
      ttfb: null,
      fcp: null,
      lcp: null,
      appStable: null,
      bootstrapToStable: null,
      htmlBytes: null,
      totalBytes: null,
    });
  });
});
