import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  LOCAL_STORAGE,
  NAVIGATOR,
  SESSION_STORAGE,
  WINDOW,
} from '../../core/platform/platform.tokens';
import { now } from '../../core/time/instant';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { Button } from '../../shared/ui/button/button';
import { TextInput } from '../../shared/ui/text-input/text-input';
import { LabSection } from '../lab-section';
import { LabNotesStore, type LabNote } from './lab-notes.store';

/** Keys this lab owns. Namespaced, so the lab never touches the application's own. */
export const LAB_LOCAL_KEY = 'ecm.lab.storage.local';
export const LAB_SESSION_KEY = 'ecm.lab.storage.session';

interface StorageEventRecord {
  readonly key: string | null;
  readonly oldValue: string | null;
  readonly newValue: string | null;
}

interface Estimate {
  readonly usage: number;
  readonly quota: number;
  readonly persisted: boolean | null;
}

/**
 * The three places a page can keep data, and what each survives
 * (docs/browser-capabilities.md, "Storage").
 *
 *  - `localStorage`: strings, synchronous, per origin, survives restarts,
 *    shared by every tab - and announced to the other tabs by a `storage`
 *    event, which the log below shows;
 *  - `sessionStorage`: the same API, but per tab and gone when it closes;
 *  - IndexedDB: structured values, asynchronous, transactional, and far
 *    larger - with the quota the browser grants shown underneath.
 *
 * The two Web Storage areas go through the application's own tokens, the
 * same `KeyValueStorage` the theme uses, so a browser that refuses storage
 * degrades here exactly as it does everywhere else.
 */
@Component({
  selector: 'app-browser-storage-lab',
  imports: [
    Button,
    DatePipe,
    LabSection,
    PageContainer,
    PageHeader,
    ReactiveFormsModule,
    TextInput,
    TranslocoDirective,
  ],
  providers: [LabNotesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t; prefix: 'pages.labs.browserStorage'">
      <app-page-header [heading]="t('heading')" [description]="t('description')" />

      <app-lab-section
        sectionId="web-storage"
        [heading]="t('webStorage.heading')"
        [description]="t('webStorage.description')"
      >
        <app-text-input
          name="storage-value"
          data-testid="storage-value"
          [label]="t('webStorage.value')"
          [formControl]="value"
        />
        <div class="actions">
          <app-button data-testid="save-local" (click)="saveLocal()">
            {{ t('webStorage.saveLocal') }}
          </app-button>
          <app-button data-testid="save-session" (click)="saveSession()">
            {{ t('webStorage.saveSession') }}
          </app-button>
        </div>
        <dl class="readout">
          <div>
            <dt>{{ t('webStorage.local') }}</dt>
            <dd data-testid="local-value">{{ localValue() ?? t('empty') }}</dd>
          </div>
          <div>
            <dt>{{ t('webStorage.session') }}</dt>
            <dd data-testid="session-value">{{ sessionValue() ?? t('empty') }}</dd>
          </div>
        </dl>
      </app-lab-section>

      <app-lab-section
        sectionId="storage-events"
        [heading]="t('events.heading')"
        [description]="t('events.description')"
      >
        @if (storageEvents().length === 0) {
          <p>{{ t('events.none') }}</p>
        } @else {
          <ol class="log" data-testid="storage-events" aria-live="polite">
            @for (event of storageEvents(); track $index) {
              <li>
                {{
                  t('events.entry', {
                    key: event.key ?? t('events.cleared'),
                    from: event.oldValue ?? t('empty'),
                    to: event.newValue ?? t('empty'),
                  })
                }}
              </li>
            }
          </ol>
        }
      </app-lab-section>

      <app-lab-section
        sectionId="indexeddb"
        [heading]="t('indexedDb.heading')"
        [description]="t('indexedDb.description')"
      >
        @if (notesAvailable) {
          <app-text-input
            name="note-text"
            data-testid="note-text"
            [label]="t('indexedDb.note')"
            [formControl]="note"
          />
          <div class="actions">
            <app-button data-testid="add-note" (click)="addNote()">
              {{ t('indexedDb.add') }}
            </app-button>
            <app-button data-testid="clear-notes" (click)="clearNotes()">
              {{ t('indexedDb.clear') }}
            </app-button>
          </div>
          <ul class="log" data-testid="notes">
            @for (entry of notes(); track entry.id) {
              <li>{{ entry.text }} - {{ entry.createdAt | date: 'medium' }}</li>
            } @empty {
              <li>{{ t('indexedDb.empty') }}</li>
            }
          </ul>
        } @else {
          <p>{{ t('unsupported') }}</p>
        }

        @if (estimate(); as quota) {
          <p data-testid="storage-estimate">
            {{
              t('indexedDb.estimate', {
                usage: kilobytes(quota.usage),
                quota: megabytes(quota.quota),
              })
            }}
            {{ quota.persisted ? t('indexedDb.persisted') : t('indexedDb.bestEffort') }}
          </p>
        }
      </app-lab-section>

      @if (failure(); as key) {
        <p role="alert">{{ t(key) }}</p>
      }
    </app-page-container>
  `,
  styles: `
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .readout {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-5);
      margin: 0;
    }

    dt {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    dd {
      margin: 0;
      font-weight: var(--weight-semibold);
    }

    .log {
      margin: 0;
      padding-inline-start: var(--space-5);
    }
  `,
})
export class BrowserStorageLab {
  private readonly local = inject(LOCAL_STORAGE);
  private readonly session = inject(SESSION_STORAGE);
  private readonly notesStore = inject(LabNotesStore);
  private readonly navigator = inject(NAVIGATOR);

  protected readonly value = new FormControl('', { nonNullable: true });
  protected readonly note = new FormControl('', { nonNullable: true });
  protected readonly localValue = signal(this.local.read(LAB_LOCAL_KEY));
  protected readonly sessionValue = signal(this.session.read(LAB_SESSION_KEY));
  protected readonly storageEvents = signal<readonly StorageEventRecord[]>([]);
  protected readonly notesAvailable = this.notesStore.available;
  protected readonly notes = signal<readonly LabNote[]>([]);
  protected readonly estimate = signal<Estimate | null>(null);
  protected readonly failure = signal<string | null>(null);

  constructor() {
    const win = inject(WINDOW);
    if (win) {
      // Fires in *this* tab when *another* tab of the origin changes
      // localStorage - never for this tab's own writes. (sessionStorage is
      // per tab, so its changes never reach another tab at all.)
      const onStorage = (event: StorageEvent): void => {
        this.storageEvents.update((events) => [
          ...events,
          { key: event.key, oldValue: event.oldValue, newValue: event.newValue },
        ]);
        if (event.key === LAB_LOCAL_KEY) {
          this.localValue.set(event.newValue);
        }
      };
      win.addEventListener('storage', onStorage);
      inject(DestroyRef).onDestroy(() => win.removeEventListener('storage', onStorage));
    }
    if (this.notesAvailable) {
      void this.refreshNotes();
    }
    void this.refreshEstimate();
  }

  protected saveLocal(): void {
    this.local.write(LAB_LOCAL_KEY, this.value.value);
    this.localValue.set(this.local.read(LAB_LOCAL_KEY));
  }

  protected saveSession(): void {
    this.session.write(LAB_SESSION_KEY, this.value.value);
    this.sessionValue.set(this.session.read(LAB_SESSION_KEY));
  }

  protected async addNote(): Promise<void> {
    const text = this.note.value.trim();
    if (!text) {
      return;
    }
    await this.guard(() => this.notesStore.add(text, now()));
    this.note.reset();
    await this.refreshNotes();
    await this.refreshEstimate();
  }

  protected async clearNotes(): Promise<void> {
    await this.guard(() => this.notesStore.clear());
    await this.refreshNotes();
  }

  protected kilobytes(bytes: number): number {
    return Math.round(bytes / 1024);
  }

  protected megabytes(bytes: number): number {
    return Math.round(bytes / 1024 / 1024);
  }

  private async refreshNotes(): Promise<void> {
    await this.guard(async () => this.notes.set(await this.notesStore.list()));
  }

  /** `navigator.storage`: how much this origin uses, and may use. */
  private async refreshEstimate(): Promise<void> {
    const storage = this.navigator?.storage;
    if (!storage?.estimate) {
      return;
    }
    const { usage = 0, quota = 0 } = await storage.estimate();
    const persisted = storage.persisted ? await storage.persisted() : null;
    this.estimate.set({ usage, quota, persisted });
  }

  private async guard(work: () => Promise<void>): Promise<void> {
    try {
      await work();
      this.failure.set(null);
    } catch {
      // Quota exceeded, storage blocked, database held by an older tab: the
      // lab says what failed, never the browser's own message.
      this.failure.set('failed');
    }
  }
}
