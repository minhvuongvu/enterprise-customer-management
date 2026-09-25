import { Injectable } from '@angular/core';
import { injectIndexedDb, openDatabase, requestResult, transactionDone } from './indexed-db';

export interface LabNote {
  readonly id?: number;
  readonly text: string;
  /** UTC ISO-8601, like every instant in this application. */
  readonly createdAt: string;
}

const DATABASE = 'ecm-lab-notes';
const VERSION = 1;
const STORE = 'notes';

/**
 * Notes kept in IndexedDB - the storage lab's demonstration of a database in
 * the browser: structured values rather than strings, asynchronous, and
 * transactional. Survives reloads and browser restarts, like `localStorage`,
 * but can hold far more and never blocks the main thread while it works.
 */
@Injectable()
export class LabNotesStore {
  private readonly factory = injectIndexedDb();
  private database: Promise<IDBDatabase> | null = null;

  get available(): boolean {
    return this.factory !== null;
  }

  async list(): Promise<LabNote[]> {
    const store = (await this.open()).transaction(STORE, 'readonly').objectStore(STORE);
    return requestResult(store.getAll() as IDBRequest<LabNote[]>);
  }

  async add(text: string, createdAt: string): Promise<void> {
    const transaction = (await this.open()).transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).add({ text, createdAt } satisfies LabNote);
    await transactionDone(transaction);
  }

  async clear(): Promise<void> {
    const transaction = (await this.open()).transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).clear();
    await transactionDone(transaction);
  }

  private open(): Promise<IDBDatabase> {
    const factory = this.factory;
    if (!factory) {
      return Promise.reject(new Error('IndexedDB is not available'));
    }
    this.database ??= openDatabase(factory, DATABASE, VERSION, (database) => {
      database.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    });
    return this.database;
  }
}
