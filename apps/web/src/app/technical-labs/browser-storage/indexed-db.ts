import { inject } from '@angular/core';
import { WINDOW } from '../../core/platform/platform.tokens';

/**
 * The smallest bridge from IndexedDB's event-based API to promises.
 *
 * IndexedDB predates promises: every operation is an `IDBRequest` that fires
 * `success` or `error`, inside a transaction that fires `complete`. Two labs
 * use it - the storage lab's notes and the offline lab's snapshot - and both
 * would otherwise repeat the same three wrappers. It is deliberately not a
 * library (`idb`, Dexie): there is no query builder, no schema versioning
 * beyond `onupgradeneeded`, and every call site still names the store and the
 * transaction mode, so what IndexedDB is doing stays visible.
 */

/** The browser's IndexedDB, or `null` on the server and where it is blocked. */
export function injectIndexedDb(): IDBFactory | null {
  try {
    return inject(WINDOW)?.indexedDB ?? null;
  } catch {
    // Some browsers throw on access in a private window with storage blocked.
    return null;
  }
}

/** Resolves with the request's result, or rejects with its error. */
export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Resolves when the transaction commits. A write is durable only then - a
 * request's own `success` means it was accepted, not that it was saved.
 */
export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
  });
}

/**
 * Opens a database, creating or upgrading its stores when `version` is new.
 *
 * `blocked` means another tab holds the database open at an older version and
 * has not closed it; the upgrade waits for it. Rejecting says so instead of
 * hanging.
 */
export function openDatabase(
  factory: IDBFactory,
  name: string,
  version: number,
  upgrade: (database: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, version);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => {
      const database = request.result;
      // Let a newer version in another tab upgrade: close instead of blocking it.
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`Database ${name} is held open by another tab`));
  });
}
