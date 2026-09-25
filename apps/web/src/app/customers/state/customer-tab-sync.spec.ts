import { provideLocationMocks } from '@angular/common/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { RealtimeEvent } from '@ecm/contracts';
import { firstValueFrom, Subject } from 'rxjs';
import { TAB_CHANNEL_NAME } from '../../core/cross-tab/tab-channel';
import { NotificationService } from '../../core/notifications/notification.service';
import { RealtimeClient } from '../../core/realtime/realtime-client';
import { FakeBroadcastNetwork } from '../../core/testing/broadcast-testing';
import { provideTestHttp } from '../../core/testing/http-testing';
import { provideSignedInAs } from '../../core/testing/session-testing';
import { aCustomer } from '../testing/customer.fixture';
import { CustomerCache } from './customer-cache';
import {
  CUSTOMERS_TOPIC,
  CustomerRealtimeSync,
  isOwnCustomerChange,
} from './customer-realtime-sync';
import { CustomerStore } from './customer-store';
import { valueOf } from './remote-data';

@Component({ selector: 'app-stub', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class Stub {}

/**
 * The same user, two tabs (debt row 25): what one tab's store changed is
 * announced to the other, which reacts as it does to another user's change.
 */
describe('CustomerRealtimeSync across tabs', () => {
  const customer = aCustomer({ status: 'ACTIVE', version: 3 });
  let network: FakeBroadcastNetwork;
  let otherTab: BroadcastChannel;
  let fromThisTab: unknown[];
  let store: CustomerStore;
  let notifications: NotificationService;
  let backend: HttpTestingController;

  beforeEach(async () => {
    network = new FakeBroadcastNetwork();
    TestBed.configureTestingModule({
      providers: [
        network.provide(),
        provideTestHttp(),
        provideSignedInAs('admin'),
        provideLocationMocks(),
        provideRouter([{ path: 'customers/:id', component: Stub }]),
        {
          provide: RealtimeClient,
          useValue: { events$: new Subject<RealtimeEvent>(), resync$: new Subject<void>() },
        },
        CustomerCache,
        CustomerStore,
        CustomerRealtimeSync,
      ],
    });
    store = TestBed.inject(CustomerStore);
    notifications = TestBed.inject(NotificationService);
    backend = TestBed.inject(HttpTestingController);
    TestBed.inject(CustomerRealtimeSync);
    otherTab = network.channel(TAB_CHANNEL_NAME);
    fromThisTab = [];
    otherTab.addEventListener('message', (event) => fromThisTab.push(event.data));

    await TestBed.inject(Router).navigateByUrl(`/customers/${customer.id}`);
    store.selectCustomer(customer.id);
    backend.expectOne(`/api/customers/${customer.id}`).flush(customer);
  });

  afterEach(() => backend.verify());

  it('announces a change once the server has accepted it', async () => {
    const saved = firstValueFrom(store.changeStatus(customer.id, 'INACTIVE'));
    expect(fromThisTab).toEqual([]);

    backend
      .expectOne({ method: 'PATCH', url: `/api/customers/${customer.id}` })
      .flush({ ...customer, status: 'INACTIVE', version: 4 });
    await saved;
    backend.match((request) => request.url === '/api/customers');

    expect(fromThisTab).toEqual([
      {
        topic: CUSTOMERS_TOPIC,
        payload: {
          change: 'updated',
          customerId: customer.id,
          customerCode: customer.customerCode,
        },
      },
    ]);
  });

  it('announces nothing for a change that was rolled back', async () => {
    const failed = firstValueFrom(store.changeStatus(customer.id, 'INACTIVE')).catch(() => null);
    backend
      .expectOne({ method: 'PATCH', url: `/api/customers/${customer.id}` })
      .flush(null, { status: 500, statusText: 'Server Error' });
    await failed;

    expect(fromThisTab).toEqual([]);
  });

  it('reacts to another tab like to another user - with a sentence that says "tab"', () => {
    otherTab.postMessage({
      topic: CUSTOMERS_TOPIC,
      payload: { change: 'updated', customerId: customer.id, customerCode: customer.customerCode },
    });

    // Flagged, not replaced - the same rule as realtime.
    expect(store.detailStaleness()).toBe('updated');
    expect(valueOf(store.detail())?.version).toBe(3);
    expect(notifications.messages()[0]).toMatchObject({
      kind: 'snackbar',
      messageKey: 'crossTab.customer.updated',
      params: { code: customer.customerCode },
    });
    expect(notifications.entries()[0].messageKey).toBe('crossTab.customer.updated');
  });

  it('revalidates everything when another tab changed many customers', () => {
    otherTab.postMessage({ topic: CUSTOMERS_TOPIC, payload: { change: 'many' } });

    expect(store.detailStaleness()).toBe('unverified');
    expect(notifications.entries()[0].messageKey).toBe('crossTab.customers.many');
  });

  it('ignores a payload it cannot trust', () => {
    otherTab.postMessage({
      topic: CUSTOMERS_TOPIC,
      payload: { change: 'updated', customerId: 'not-a-uuid', customerCode: 'X' },
    });

    expect(store.detailStaleness()).toBeNull();
    expect(notifications.entries()).toEqual([]);
  });
});

describe('isOwnCustomerChange', () => {
  it('accepts the shapes a store emits, and nothing else', () => {
    const id = aCustomer().id;
    expect(isOwnCustomerChange({ change: 'many' })).toBe(true);
    expect(isOwnCustomerChange({ change: 'deleted', customerId: id, customerCode: null })).toBe(
      true,
    );
    expect(isOwnCustomerChange({ change: 'renamed', customerId: id, customerCode: 'C' })).toBe(
      false,
    );
    expect(isOwnCustomerChange({ change: 'updated', customerId: id })).toBe(false);
    expect(isOwnCustomerChange(null)).toBe(false);
  });
});
