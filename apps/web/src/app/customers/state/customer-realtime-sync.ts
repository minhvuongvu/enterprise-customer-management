import {
  inject,
  Injectable,
  provideEnvironmentInitializer,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { Router } from '@angular/router';
import { customerIdSchema, type CustomerId, type RealtimeEvent } from '@ecm/contracts';
import { SessionService } from '../../core/auth/session.service';
import { TabChannel } from '../../core/cross-tab/tab-channel';
import { NotificationService } from '../../core/notifications/notification.service';
import { RealtimeClient } from '../../core/realtime/realtime-client';
import { CustomerStore, type OwnCustomerChange } from './customer-store';

/** The customer feature's topic on the tab channel. */
export const CUSTOMERS_TOPIC = 'customers';

/** Who made a change this tab is hearing about. Decides the sentence. */
type Origin = 'another-user' | 'another-tab';

/**
 * Checks a payload from another tab before believing it: that tab may be
 * running a different build (`TabChannel`).
 */
export function isOwnCustomerChange(payload: unknown): payload is OwnCustomerChange {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  if (candidate['change'] === 'many') {
    return true;
  }
  return (
    (candidate['change'] === 'created' ||
      candidate['change'] === 'updated' ||
      candidate['change'] === 'deleted') &&
    customerIdSchema.safeParse(candidate['customerId']).success &&
    (typeof candidate['customerCode'] === 'string' || candidate['customerCode'] === null)
  );
}

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
 * The user's own changes are ignored on the realtime stream: this tab already
 * applied them when the request returned, and "Customer C-000001 was updated
 * by another user" would be false. The stream names the user, not the tab, so
 * it cannot say more.
 *
 * Changes the same user makes in *another tab* arrive instead over the tab
 * channel (Phase 5, debt row 25): each tab posts what its store changed
 * (`CustomerStore.ownChanges$`), and every other tab reacts exactly as it
 * does to another user's change - with a sentence that says "in another tab".
 * A tab never receives its own post, so nothing is applied twice.
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

    const tabs = inject(TabChannel);
    this.store.ownChanges$
      .pipe(takeUntilDestroyed())
      .subscribe((change) => tabs.post(CUSTOMERS_TOPIC, change));
    tabs
      .on(CUSTOMERS_TOPIC)
      .pipe(filter(isOwnCustomerChange), takeUntilDestroyed())
      .subscribe((change) => this.applyFromAnotherTab(change));
  }

  private applyFromAnotherTab(change: OwnCustomerChange): void {
    if (change.change === 'many') {
      this.store.revalidateAll();
      this.notifications.record('crossTab.customers.many');
      return;
    }
    this.react(change.change, change.customerId, change.customerCode, 'another-tab');
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
    this.react(change, event.customerId, event.customerCode, 'another-user');
  }

  /** The same reaction, whoever made the change; only the sentence differs. */
  private react(
    change: 'created' | 'updated' | 'deleted',
    customerId: CustomerId,
    customerCode: string | null,
    origin: Origin,
  ): void {
    const onScreen = this.isOnScreen(customerId);

    this.store.applyRemoteChange(customerId, change);

    const messageKey =
      origin === 'another-user'
        ? `realtime.customer.${change}`
        : customerCode
          ? `crossTab.customer.${change}`
          : `crossTab.customer.${change}Unnamed`;
    const params = { code: customerCode ?? '' };
    const link = change === 'deleted' ? null : ['/customers', customerId];

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
