import { inject, Injectable } from '@angular/core';
import { Logger } from '../logging/logger';
import { ErrorTracker } from './error-tracker';

/**
 * Important user interactions, as named, typed events.
 *
 * The union below is the whole vocabulary. An event carries *what kind of
 * thing* happened and small, non-identifying facts about it (a count, a role,
 * which filters were in use) - never a customer's name, email or search text,
 * and the types make that a compile error rather than a review comment. Where
 * a record matters, the correlation id of the request that changed it is
 * already in the request log.
 *
 * An event goes two places: an `info` log line (`User interaction`), and a
 * breadcrumb, so an error report shows the steps that led to it.
 *
 * Deliberately not an analytics product: no funnels, no user ids, no sampling.
 * It answers "what was this user doing when it broke?" and "is anyone using
 * import?" - the two questions an operator of this application asks
 * (docs/observability.md).
 */
export type InteractionEvent =
  | { readonly name: 'session.signed_in'; readonly role: string }
  | { readonly name: 'session.signed_out' }
  | { readonly name: 'customer.created' }
  | { readonly name: 'customer.updated' }
  | { readonly name: 'customer.deleted' }
  | { readonly name: 'customer.status_changed'; readonly status: string }
  | { readonly name: 'customers.bulk_action'; readonly action: string; readonly count: number }
  | { readonly name: 'customers.imported'; readonly imported: number; readonly skipped: number }
  | { readonly name: 'customers.exported' }
  | { readonly name: 'preferences.language_changed'; readonly language: string }
  | { readonly name: 'preferences.theme_changed'; readonly theme: string };

export type InteractionName = InteractionEvent['name'];

@Injectable({ providedIn: 'root' })
export class Telemetry {
  private readonly logger = inject(Logger);
  private readonly errors = inject(ErrorTracker);

  track(event: InteractionEvent): void {
    const { name, ...data } = event;
    this.logger.info('User interaction', { event: name, ...data });
    this.errors.addBreadcrumb({ category: 'interaction', message: name, data });
  }
}
