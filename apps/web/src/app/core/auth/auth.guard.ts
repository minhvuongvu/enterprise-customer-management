import { CanActivateFn } from '@angular/router';

/**
 * Route protection seam.
 *
 * Wired into the route tree from Phase 0 so that Phase 3 changes one function
 * body instead of restructuring routing. It currently lets everyone through,
 * and says so rather than pretending otherwise.
 *
 * Note for every later phase: a guard is a navigation-UX control. It is not a
 * security boundary. The API enforces access independently - see
 * ANGULAR_PROJECT_CONTEXT.md 3.2.
 */
export const authGuard: CanActivateFn = () => {
  // Phase 3: check SessionService, redirect to /login, preserve the intended
  // destination.
  return true;
};
