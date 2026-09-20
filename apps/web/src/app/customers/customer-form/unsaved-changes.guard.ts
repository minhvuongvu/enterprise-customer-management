import type { CanDeactivateFn } from '@angular/router';
import type { Observable } from 'rxjs';

/**
 * What a route component must offer to be protected from being left by
 * accident.
 */
export interface CanLeave {
  /**
   * `true` to leave immediately, or a stream that emits the user's answer.
   *
   * The component answers rather than the guard, because the question - "are
   * there unsaved changes, and does the user want to keep them" - needs the
   * form and a dialog, and both belong to the component. A guard that reached
   * into the component to find out would be the same coupling written twice.
   */
  canLeave(): boolean | Observable<boolean>;
}

/**
 * Stops an in-progress edit from being lost to a stray click.
 *
 * It covers navigation *inside the application*: a link, the back button, a
 * programmatic redirect. It does **not** cover closing the tab or typing a new
 * address - that needs `beforeunload`, which is a browser API and belongs to
 * Phase 5 along with the rest of them.
 *
 * Worth stating plainly, because this is a control users trust: it is a
 * convenience, not a guarantee. Nothing here can prevent a lost edit if the
 * browser crashes, and describing it as protection would be the kind of claim
 * ANGULAR_PROJECT_CONTEXT.md 4.12 forbids.
 */
export const unsavedChangesGuard: CanDeactivateFn<CanLeave | null> = (component) =>
  // `component` is genuinely nullable at runtime whatever the type says: the
  // router passes the outlet's component, and a route that was resolved but
  // never rendered has none. Nothing can be unsaved in that case, so the
  // answer is yes - and calling a method on null here would turn every
  // navigation away from the form into an unhandled error.
  component?.canLeave() ?? true;
