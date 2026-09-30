import type { Provider } from '@angular/core';

/**
 * The production build's `dev-tools.providers.ts`: no developer tooling.
 * Swapped in by angular.json `fileReplacements`; see that file.
 */
export function provideDevTools(): Provider[] {
  return [];
}
