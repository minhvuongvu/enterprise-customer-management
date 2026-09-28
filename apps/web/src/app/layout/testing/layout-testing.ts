import { computed, signal, type Provider } from '@angular/core';
import { LayoutBreakpoints, type LayoutMode } from '../layout-breakpoints';

/**
 * A fixed layout for a component test.
 *
 * Test-only. jsdom implements no media queries, so CDK's `BreakpointObserver`
 * reports every one of them as not matching - which `LayoutBreakpoints` reads,
 * correctly, as the narrowest layout. Since Phase 6 the customer list renders
 * different components on a phone, so a test that does not say which layout
 * it means would silently be testing the phone one.
 */
export function provideLayoutMode(mode: LayoutMode = 'desktop'): Provider {
  const current = signal<LayoutMode>(mode);
  return {
    provide: LayoutBreakpoints,
    useValue: {
      mode: current.asReadonly(),
      usesDrawerNavigation: computed(() => current() === 'mobile'),
    } satisfies Pick<LayoutBreakpoints, 'mode' | 'usesDrawerNavigation'>,
  };
}
