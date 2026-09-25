import {
  inject,
  Injectable,
  provideEnvironmentInitializer,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import type { RealtimeEvent } from '@ecm/contracts';
import { SessionService } from '../../core/auth/session.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { RealtimeClient } from '../../core/realtime/realtime-client';
import { CustomerStore } from './customer-store';

/**
 * Turns realtime events into the customer feature's reactions.
 *
 * The realtime client knows about streams; the store knows about caches; this
 * is the one place that knows what "customer C-000001 was updated by someone
 * else" should *do*:
 *
 *  1. tell the store, which drops what the event makes stale and refetches
 *     the list if it is on screen (`CustomerStore.applyRemoteChange`);
 *  2. if it is the customer on screen, say so with a snackbar whose action
 *     refreshes it - the record is flagged, never replaced under the user;
 *  3. record it in the notification centre, with a link.
 *
 * ## Whose events
 *
 * The user's own changes are ignored: this tab already applied them when the
 * request returned, and "Customer C-000001 was updated by another user" would
 * be false. The cost is that a change made in *another tab* by the same user
 * is not announced here either; the list still catches up on its next fetch.
 * Telling tabs apart would need a per-tab id on every write, which the API
 * does not have. ADR-0020.
 *
 * ## Lifetime
 *
 * Provided by the customers route beside the store, so it exists exactly
 * while the store does. Outside the customers section nothing listens - there
 * is no customer state there to keep fresh.
 */
@Injectable()
export class CustomerRealtimeSync {
  private readonly store = inject(CustomerStore);
  private readonly session = inject(SessionService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  constructor() {
    const realtime = inject(RealtimeClient);
    realtime.events$.pipe(takeUntilDestroyed()).subscribe((event) => this.apply(event));
    realtime.resync$.pipe(takeUntilDestroyed()).subscribe(() => this.store.revalidateAll());
  }

  private apply(event: RealtimeEvent): void {
    if (event.type === 'system.notice') {
      this.notifications.toast(event.messageKey, { tone: 'info' });
      this.notifications.record(event.messageKey);
      return;
    }

    if (event.actorId === this.session.user()?.id) {
      return;
    }

    if (event.type === 'import.completed') {
      this.store.refreshList();
      this.notifications.record('realtime.importCompleted', {
        params: { succeeded: event.succeeded, failed: event.failed },
      });
      return;
    }

    const change =
      event.type === 'customer.created'
        ? 'created'
        : event.type === 'customer.deleted'
          ? 'deleted'
          : 'updated';
    const onScreen = this.isOnScreen(event.customerId);

    this.store.applyRemoteChange(event.customerId, change);

    const messageKey = `realtime.customer.${change}`;
    const params = { code: event.customerCode };
    const link = change === 'deleted' ? null : ['/customers', event.customerId];

    this.notifications.record(messageKey, { params, link: link ?? undefined });

    if (onScreen && change === 'updated') {
      this.notifications.snackbar(messageKey, {
        params,
        actionKey: 'realtime.refresh',
        action: () => this.store.refreshDetail(),
      });
    } else if (onScreen && change === 'deleted') {
      this.notifications.snackbar(messageKey, {
        params,
        tone: 'warning',
        actionKey: 'realtime.backToList',
        action: () => void this.router.navigate(['/customers']),
      });
    }
  }

  /** Whether the customer is the one the user is looking at or editing. */
  private isOnScreen(customerId: string): boolean {
    return this.router.url.split(/[?#]/)[0].split('/')[2] === customerId;
  }
}

/** Provides the sync and starts it with the route's injector. */
export function provideCustomerRealtimeSync(): (Provider | EnvironmentProviders)[] {
  return [
    CustomerRealtimeSync,
    provideEnvironmentInitializer(() => {
      inject(CustomerRealtimeSync);
    }),
  ];
}
