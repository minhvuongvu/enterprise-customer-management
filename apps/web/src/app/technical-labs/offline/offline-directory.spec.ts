import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { findFixtureUserByUsername, type Customer, type CustomerId } from '@ecm/contracts';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { ConnectivityService } from '../../core/connectivity/connectivity.service';
import { appError } from '../../core/errors/app-error';
import { provideSignedInAs } from '../../core/testing/session-testing';
import { OfflineDirectory } from './offline-directory';
import { OfflineDirectoryApi } from './offline-directory.api';
import {
  OfflineSnapshotStore,
  toSnapshotCustomer,
  type OfflineSnapshot,
} from './offline-snapshot.store';

/** IndexedDB, reduced to the one record the directory keeps. */
class MemorySnapshots {
  snapshot: OfflineSnapshot | null = null;
  readonly available = true;
  read = async () => this.snapshot;
  write = async (snapshot: OfflineSnapshot) => void (this.snapshot = snapshot);
  remove = async () => void (this.snapshot = null);
}

/**
 * A whole customer record, as the API returns it. Written out here rather
 * than borrowed from the customer feature's test fixtures: a lab does not
 * import from a feature, tests included (rule 4).
 */
const customer = {
  id: '11111111-1111-4111-8111-111111111112' as CustomerId,
  customerCode: 'C-000001',
  fullName: 'Nguyễn Văn A',
  email: 'an@example.test',
  phone: '+84900000000',
  dateOfBirth: '1990-01-01',
  gender: 'MALE',
  status: 'ACTIVE',
  address: { line1: '1 Lê Lợi', line2: null, city: 'Hà Nội', postalCode: '100000', country: 'VN' },
  avatarUrl: null,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  createdBy: '11111111-1111-4111-8111-111111111111',
  updatedBy: '11111111-1111-4111-8111-111111111111',
  version: 1,
} as unknown as Customer;

describe('OfflineDirectory', () => {
  const admin = findFixtureUserByUsername('admin')!;
  let snapshots: MemorySnapshots;
  let online: WritableSignal<boolean>;
  let reconnected: Subject<void>;
  let firstPage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    snapshots = new MemorySnapshots();
    online = signal(true);
    reconnected = new Subject();
    firstPage = vi.fn(() => of([customer]));
    TestBed.configureTestingModule({
      providers: [
        provideSignedInAs('admin'),
        { provide: OfflineSnapshotStore, useValue: snapshots },
        { provide: OfflineDirectoryApi, useValue: { firstPage } },
        { provide: ConnectivityService, useValue: { online, reconnected$: reconnected } },
        OfflineDirectory,
      ],
    });
  });

  it('online: shows the server list and saves a minimal copy for this user', async () => {
    const directory = TestBed.inject(OfflineDirectory);
    await directory.load();

    expect(directory.state().source).toBe('network');
    expect(snapshots.snapshot?.ownerId).toBe(admin.id);
    // No date of birth, no phone: only what the list shows.
    expect(snapshots.snapshot?.customers).toEqual([toSnapshotCustomer(customer)]);
    expect(Object.keys(snapshots.snapshot?.customers[0] ?? {})).toEqual([
      'id',
      'customerCode',
      'fullName',
      'status',
    ]);
  });

  it('offline: shows the saved copy, labelled, without asking the server', async () => {
    const directory = TestBed.inject(OfflineDirectory);
    await directory.load();
    online.set(false);
    firstPage.mockClear();

    await directory.load();

    expect(firstPage).not.toHaveBeenCalled();
    expect(directory.state()).toMatchObject({ source: 'saved', loading: false });
    expect(directory.state().customers).toHaveLength(1);
  });

  it('online but the server fails: falls back to the saved copy', async () => {
    const directory = TestBed.inject(OfflineDirectory);
    await directory.load();
    firstPage.mockReturnValue(throwError(() => appError('network')));

    await directory.load();

    expect(directory.state().source).toBe('saved');
  });

  it("never shows another user's copy - it deletes it", async () => {
    snapshots.snapshot = {
      ownerId: 'someone-else',
      savedAt: '2026-09-25T10:00:00.000Z' as never,
      customers: [],
    };
    online.set(false);
    const directory = TestBed.inject(OfflineDirectory);

    await directory.load();

    expect(directory.state().source).toBe('none');
    expect(snapshots.snapshot).toBeNull();
  });

  it('refreshes by itself when the network returns', async () => {
    const directory = TestBed.inject(OfflineDirectory);
    online.set(false);
    await directory.load();
    firstPage.mockClear();

    online.set(true);
    reconnected.next();
    await new Promise((resolve) => setTimeout(resolve));

    expect(firstPage).toHaveBeenCalledTimes(1);
    expect(directory.state().source).toBe('network');
  });

  it('deletes the copy when the session ends', async () => {
    const directory = TestBed.inject(OfflineDirectory);
    await directory.load();
    expect(snapshots.snapshot).not.toBeNull();

    await firstValueFrom(TestBed.inject(SessionService).signOut());
    await new Promise((resolve) => setTimeout(resolve));

    expect(snapshots.snapshot).toBeNull();
  });
});
