import {
  inject,
  Injectable,
  provideEnvironmentInitializer,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import { SessionService } from '../../core/auth/session.service';
import type { Customer } from '@ecm/contracts';
import type { Instant } from '../../core/time/instant';
import {
  injectIndexedDb,
  openDatabase,
  requestResult,
  transactionDone,
} from '../browser-storage/indexed-db';

/**
 * What is kept on disk: the fields the read-only list shows, and nothing
 * else. Not the date of birth, not the phone number - data written to
 * IndexedDB outlives the session unless something deletes it, so what is not
 * needed offline is not stored (docs/offline.md, "What is on the disk").
 */
export type SnapshotCustomer = Pick<Customer, 'id' | 'customerCode' | 'fullName' | 'status'>;

export interface OfflineSnapshot {
  /** The user it was saved for. Another user's snapshot is deleted, never shown. */
  readonly ownerId: string;
  readonly savedAt: Instant;
  readonly customers: readonly SnapshotCustomer[];
}

const DATABASE = 'ecm-lab-offline';
const VERSION = 1;
const STORE = 'snapshots';
const KEY = 'customers';

export function toSnapshotCustomer(customer: Customer): SnapshotCustomer {
  return {
    id: customer.id,
    customerCode: customer.customerCode,
    fullName: customer.fullName,
    status: customer.status,
  };
}

/** One record in IndexedDB: the last list this user saw while online. */
@Injectable()
export class OfflineSnapshotStore {
  private readonly factory = injectIndexedDb();
  private database: Promise<IDBDatabase> | null = null;

  get available(): boolean {
    return this.factory !== null;
  }

  async read(): Promise<OfflineSnapshot | null> {
    const store = (await this.open()).transaction(STORE, 'readonly').objectStore(STORE);
    return (await requestResult(store.get(KEY) as IDBRequest<OfflineSnapshot | undefined>)) ?? null;
  }

  async write(snapshot: OfflineSnapshot): Promise<void> {
    const transaction = (await this.open()).transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(snapshot, KEY);
    await transactionDone(transaction);
  }

  async remove(): Promise<void> {
    const transaction = (await this.open()).transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete(KEY);
    await transactionDone(transaction);
  }

  private open(): Promise<IDBDatabase> {
    const factory = this.factory;
    if (!factory) {
      return Promise.reject(new Error('IndexedDB is not available'));
    }
    this.database ??= openDatabase(factory, DATABASE, VERSION, (database) => {
      database.createObjectStore(STORE);
    });
    return this.database;
  }
}

/**
 * The snapshot store, and the rule that the snapshot does not outlive the
 * session: when the session ends in this tab - signed out here, in another
 * tab, or expired - the saved copy is deleted, wherever the user is by then.
 *
 * Provided on the offline lab's route, whose injector lives from the first
 * visit to the lab until the tab closes; so any tab that has opened the lab
 * cleans up after it. `OfflineDirectory` also clears what it shows.
 */
export function provideOfflineSnapshots(): (Provider | EnvironmentProviders)[] {
  return [
    OfflineSnapshotStore,
    provideEnvironmentInitializer(() => {
      const snapshots = inject(OfflineSnapshotStore);
      inject(SessionService).ended$.subscribe(() => {
        if (snapshots.available) {
          void snapshots.remove().catch(() => undefined);
        }
      });
    }),
  ];
}
