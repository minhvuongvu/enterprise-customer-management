import { provideLocationMocks } from '@angular/common/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { findFixtureUserByUsername, type RealtimeEvent } from '@ecm/contracts';
import { Subject } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';
import { RealtimeClient } from '../../core/realtime/realtime-client';
import { provideTestHttp } from '../../core/testing/http-testing';
import { provideSignedInAs } from '../../core/testing/session-testing';
import { aCustomer } from '../testing/customer.fixture';
import { CustomerCache } from './customer-cache';
import { CustomerRealtimeSync } from './customer-realtime-sync';
import { CustomerStore } from './customer-store';

@Component({ selector: 'app-stub', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class Stub {}

/**
 * What the customer feature does with news - the scenario the phase is built
 * around: user A updates C-000001, user B is told, and can refresh.
 */
describe('CustomerRealtimeSync', () => {
  const customer = aCustomer();
  const manager = findFixtureUserByUsername('manager')!;
  const admin = findFixtureUserByUsername('admin')!;
  let events: Subject<RealtimeEvent>;
  let resyncs: Subject<void>;
  let store: CustomerStore;
  let notifications: NotificationService;
  let backend: HttpTestingController;

  function updatedBy(actorId: string, id = 'e-1'): RealtimeEvent {
    return {
      type: 'customer.updated',
      id,
      at: '2026-09-25T10:00:00.000Z',
      customerId: customer.id,
      customerCode: customer.customerCode,
      actorId,
      changedFields: ['fullName'],
    } as RealtimeEvent;
  }

  beforeEach(async () => {
    events = new Subject();
    resyncs = new Subject();
    TestBed.configureTestingModule({
      providers: [
        provideTestHttp(),
        provideSignedInAs('admin'),
        provideLocationMocks(),
        provideRouter([{ path: 'customers/:id', component: Stub }]),
        { provide: RealtimeClient, useValue: { events$: events, resync$: resyncs } },
        CustomerCache,
        CustomerStore,
        CustomerRealtimeSync,
      ],
    });
    store = TestBed.inject(CustomerStore);
    notifications = TestBed.inject(NotificationService);
    backend = TestBed.inject(HttpTestingController);
    TestBed.inject(CustomerRealtimeSync);

    // User B has C-000001 open.
    await TestBed.inject(Router).navigateByUrl(`/customers/${customer.id}`);
    store.selectCustomer(customer.id);
    backend.expectOne(`/api/customers/${customer.id}`).flush(customer);
  });

  afterEach(() => backend.verify());

  it('tells the user that someone else changed the customer they are looking at', () => {
    events.next(updatedBy(manager.id));

    // A snackbar that offers a refresh...
    const [snackbar] = notifications.messages();
    expect(snackbar).toMatchObject({
      kind: 'snackbar',
      messageKey: 'realtime.customer.updated',
      params: { code: 'C-000001' },
    });
    // ...an entry in the centre, linking to the record...
    expect(notifications.entries()[0]).toMatchObject({
      messageKey: 'realtime.customer.updated',
      link: ['/customers', customer.id],
    });
    // ...and the record flagged, not replaced.
    expect(store.detailStaleness()).toBe('updated');

    // Acting on the snackbar revalidates the server state.
    notifications.act(snackbar.id);
    backend.expectOne(`/api/customers/${customer.id}`).flush({ ...customer, version: 2 });
    expect(store.detailStaleness()).toBeNull();
  });

  it("ignores the user's own changes - this tab already applied them", () => {
    events.next(updatedBy(admin.id));

    expect(notifications.messages()).toHaveLength(0);
    expect(notifications.entries()).toHaveLength(0);
    expect(store.detailStaleness()).toBeNull();
  });

  it('revalidates on a resync', () => {
    resyncs.next();
    expect(store.detailStaleness()).toBe('unverified');
  });
});
