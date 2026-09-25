import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { ConnectivityService } from '../../core/connectivity/connectivity.service';
import { now, type Instant } from '../../core/time/instant';
import { OfflineDirectoryApi } from './offline-directory.api';
import {
  OfflineSnapshotStore,
  toSnapshotCustomer,
  type SnapshotCustomer,
} from './offline-snapshot.store';

/** Where the rows on screen came from. Shown to the user; never blurred. */
export type DirectorySource = 'network' | 'saved' | 'none';

export interface DirectoryState {
  readonly loading: boolean;
  readonly source: DirectorySource;
  readonly customers: readonly SnapshotCustomer[];
  /** When the rows were fetched from the server - now, or when they were saved. */
  readonly asOf: Instant | null;
}

const INITIAL: DirectoryState = { loading: true, source: 'none', customers: [], asOf: null };

/**
 * The offline lab's limited offline scenario: a read-only list that survives
 * losing the network (docs/offline.md).
 *
 * The policy, in full:
 *
 *  1. **Online**: fetch from the server, show it, and save a copy to
 *     IndexedDB - a read-through cache.
 *  2. **Offline, or the fetch failed**: show the saved copy, labelled as a
 *     copy with the time it was fetched. Nothing on it can be changed;
 *     there is no write queue, so there is nothing to reconcile.
 *  3. **Back online**: fetch again, without being asked.
 *  4. **The copy belongs to one user.** A copy saved for someone else is
 *     deleted on sight, and the copy is deleted when this tab's session
 *     ends. The personal data kept is the minimum the list shows.
 *
 * What it does not do, deliberately: queue writes, sync in the background,
 * cache anything outside this lab, or claim the application works offline.
 */
@Injectable()
export class OfflineDirectory {
  private readonly api = inject(OfflineDirectoryApi);
  private readonly snapshots = inject(OfflineSnapshotStore);
  private readonly session = inject(SessionService);
  private readonly connectivity = inject(ConnectivityService);

  private readonly current = signal<DirectoryState>(INITIAL);
  readonly state = this.current.asReadonly();
  readonly online = this.connectivity.online;

  constructor() {
    this.connectivity.reconnected$.pipe(takeUntilDestroyed()).subscribe(() => void this.load());
    this.session.ended$.pipe(takeUntilDestroyed()).subscribe(() => void this.forget());
  }

  async load(): Promise<void> {
    this.current.update((state) => ({ ...state, loading: true }));
    if (this.connectivity.online()) {
      try {
        const customers = (await firstValueFrom(this.api.firstPage())).map(toSnapshotCustomer);
        const asOf = now();
        this.current.set({ loading: false, source: 'network', customers, asOf });
        await this.save(customers, asOf);
        return;
      } catch {
        // Online by the browser's account, but the server is unreachable or
        // failing. Exactly the case a saved copy exists for.
      }
    }
    await this.showSaved();
  }

  /** Deletes the saved copy - from the button, and when the session ends. */
  async forget(): Promise<void> {
    if (this.snapshots.available) {
      await this.snapshots.remove().catch(() => undefined);
    }
    if (this.current().source === 'saved') {
      this.current.set({ ...INITIAL, loading: false });
    }
  }

  private async save(customers: readonly SnapshotCustomer[], savedAt: Instant): Promise<void> {
    const ownerId = this.session.user()?.id;
    if (!ownerId || !this.snapshots.available) {
      return;
    }
    // Best effort: a full or blocked disk loses the offline copy, not the page.
    await this.snapshots.write({ ownerId, savedAt, customers }).catch(() => undefined);
  }

  private async showSaved(): Promise<void> {
    const snapshot = this.snapshots.available
      ? await this.snapshots.read().catch(() => null)
      : null;
    if (snapshot && snapshot.ownerId !== this.session.user()?.id) {
      await this.forget();
      this.current.set({ ...INITIAL, loading: false });
      return;
    }
    this.current.set(
      snapshot
        ? { loading: false, source: 'saved', customers: snapshot.customers, asOf: snapshot.savedAt }
        : { ...INITIAL, loading: false },
    );
  }
}
