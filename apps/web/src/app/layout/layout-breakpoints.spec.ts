import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { TestBed } from '@angular/core/testing';
import { existsSync, readFileSync } from 'node:fs';
import { BehaviorSubject } from 'rxjs';
import { DESKTOP_UP, LayoutBreakpoints, TABLET_UP } from './layout-breakpoints';

/** Reports whatever the test says the viewport currently matches. */
class FakeBreakpointObserver {
  readonly state = new BehaviorSubject<BreakpointState>({
    matches: false,
    breakpoints: { [TABLET_UP]: false, [DESKTOP_UP]: false },
  });

  observe() {
    return this.state.asObservable();
  }

  setWidth(tablet: boolean, desktop: boolean): void {
    this.state.next({
      matches: tablet || desktop,
      breakpoints: { [TABLET_UP]: tablet, [DESKTOP_UP]: desktop },
    });
  }
}

/**
 * Read from disk rather than imported: the stylesheet is not a module, and
 * `import.meta.url` inside the test bundle is not a file URL. The candidates
 * cover being run from the workspace root or from `apps/web`.
 */
function readBreakpointStylesheet(): string {
  const candidates = ['src/styles/_breakpoints.scss', 'apps/web/src/styles/_breakpoints.scss'];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`_breakpoints.scss not found from ${process.cwd()}`);
  }
  return readFileSync(found, 'utf8');
}

describe('LayoutBreakpoints', () => {
  let observer: FakeBreakpointObserver;

  function create() {
    observer = new FakeBreakpointObserver();
    TestBed.configureTestingModule({
      providers: [{ provide: BreakpointObserver, useValue: observer }],
    });
    return TestBed.inject(LayoutBreakpoints);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('names the layout, not the device', () => {
    const layout = create();

    observer.setWidth(true, true);
    expect(layout.mode()).toBe('desktop');

    // A desktop browser dragged to a third of the screen is a tablet layout.
    observer.setWidth(true, false);
    expect(layout.mode()).toBe('tablet');

    observer.setWidth(false, false);
    expect(layout.mode()).toBe('mobile');
  });

  it('uses a drawer only in the mobile layout', () => {
    const layout = create();

    observer.setWidth(false, false);
    expect(layout.usesDrawerNavigation()).toBe(true);

    observer.setWidth(true, false);
    expect(layout.usesDrawerNavigation()).toBe(false);
  });

  it('agrees with the stylesheet about where the breakpoints are', () => {
    // The two files are deliberately duplicated - CSS decides the layout, and
    // TypeScript decides the behaviour CSS cannot express. This is the test
    // that keeps them from drifting apart, which would produce a rail with a
    // focus trap in it, or a drawer with no way to close it.
    const scss = readBreakpointStylesheet();

    const tablet = /\$tablet-min:\s*([^;]+);/.exec(scss)?.[1].trim();
    const desktop = /\$desktop-min:\s*([^;]+);/.exec(scss)?.[1].trim();

    expect(TABLET_UP).toBe(`(min-width: ${tablet})`);
    expect(DESKTOP_UP).toBe(`(min-width: ${desktop})`);
  });
});
