import { inject } from '@angular/core';
import { WINDOW } from '../../core/platform/platform.tokens';

/**
 * `performance.now()`, reached through the injected window.
 *
 * The performance lab times its own work, and every demo needs the same
 * clock. On the server there is no window and nothing to time; the demos run
 * only on user action in the browser, so `0` there is never read.
 */
export function injectLabClock(): () => number {
  const performance = inject(WINDOW)?.performance;
  return () => performance?.now() ?? 0;
}
