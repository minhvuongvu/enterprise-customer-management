import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  BROADCAST_CHANNEL_FACTORY,
  LOCAL_STORAGE,
  WINDOW,
} from '../../core/platform/platform.tokens';
import { now, type Instant } from '../../core/time/instant';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { Button } from '../../shared/ui/button/button';
import { TextInput } from '../../shared/ui/text-input/text-input';
import { LabSection } from '../lab-section';

export const LAB_CHANNEL = 'ecm.lab.cross-tab.v1';
export const COUNTER_KEY = 'ecm.lab.cross-tab.counter';

export interface TabNote {
  readonly from: string;
  readonly text: string;
  readonly at: Instant;
}

export function isTabNote(data: unknown): data is TabNote {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const note = data as Record<string, unknown>;
  return (
    typeof note['from'] === 'string' &&
    typeof note['text'] === 'string' &&
    typeof note['at'] === 'string'
  );
}

/**
 * The two ways tabs of one origin talk to each other, side by side
 * (docs/cross-tab.md).
 *
 *  - **BroadcastChannel** carries messages. The sender posts; every other
 *    tab on the same channel name receives a structured clone. Nothing is
 *    stored: a tab opened after the message never sees it.
 *  - **The `storage` event** carries changes to `localStorage`. Nothing is
 *    sent: the browser notices the write and tells the other tabs. The value
 *    stays, so a tab opened later reads it - which also makes it the right
 *    tool for state, and the wrong one for messages.
 *
 * The shared counter shows the storage event's classic trap: increment is
 * read-modify-write, and two tabs clicking at once can both read 4 and both
 * write 5. `localStorage` has no transaction to prevent it.
 */
@Component({
  selector: 'app-cross-tab-lab',
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t; prefix: 'pages.labs.crossTab'">
      <app-page-header [heading]="t('heading')" [description]="t('lede', { id: tabId })" />

      <app-lab-section
        sectionId="broadcast"
        [heading]="t('broadcast.heading')"
        [description]="t('broadcast.description')"
      >
        @if (channelAvailable) {
          <app-text-input
            name="tab-message"
            data-testid="tab-message"
            [label]="t('broadcast.message')"
            [formControl]="message"
          />
          <app-button data-testid="tab-send" (click)="send()">{{ t('broadcast.send') }}</app-button>
          <ol class="log" data-testid="tab-received" aria-live="polite">
            @for (note of received(); track $index) {
              <li>
                {{
                  t('broadcast.entry', {
                    from: note.from,
                    text: note.text,
                    at: note.at | date: 'mediumTime',
                  })
                }}
              </li>
            } @empty {
              <li>{{ t('broadcast.none') }}</li>
            }
          </ol>
        } @else {
          <p>{{ t('unsupported') }}</p>
        }
      </app-lab-section>

      <app-lab-section
        sectionId="storage-event"
        [heading]="t('storage.heading')"
        [description]="t('storage.description')"
      >
        <p data-testid="shared-counter">{{ t('storage.counter', { value: counter() }) }}</p>
        <app-button data-testid="counter-increment" (click)="increment()">
          {{ t('storage.increment') }}
        </app-button>
      </app-lab-section>

      <app-lab-section
        sectionId="in-the-application"
        [heading]="t('application.heading')"
        [description]="t('application.description')"
      >
        <ul class="log">
          <li>{{ t('application.customers') }}</li>
          <li>{{ t('application.signOut') }}</li>
          <li>{{ t('application.refresh') }}</li>
          <li>{{ t('application.theme') }}</li>
        </ul>
      </app-lab-section>
    </app-page-container>
  `,
  styles: `
    .log {
      margin: 0;
      padding-inline-start: var(--space-5);
    }
  `,
})
export class CrossTabLab {
  private readonly storage = inject(LOCAL_STORAGE);
  private readonly channel = inject(BROADCAST_CHANNEL_FACTORY)(LAB_CHANNEL);

  protected readonly tabId: string;
  protected readonly channelAvailable = this.channel !== null;
  protected readonly message = new FormControl('', { nonNullable: true });
  protected readonly received = signal<readonly TabNote[]>([]);
  protected readonly counter = signal(this.readCounter());

  constructor() {
    const win = inject(WINDOW);
    this.tabId = win?.crypto.randomUUID().slice(0, 8) ?? 'server';
    const destroyRef = inject(DestroyRef);

    const channel = this.channel;
    if (channel) {
      const onMessage = (event: MessageEvent<unknown>): void => {
        if (isTabNote(event.data)) {
          const note = event.data;
          this.received.update((notes) => [...notes, note]);
        }
      };
      channel.addEventListener('message', onMessage);
      destroyRef.onDestroy(() => {
        channel.removeEventListener('message', onMessage);
        channel.close();
      });
    }

    if (win) {
      const onStorage = (event: StorageEvent): void => {
        if (event.key === COUNTER_KEY || event.key === null) {
          this.counter.set(this.readCounter());
        }
      };
      win.addEventListener('storage', onStorage);
      destroyRef.onDestroy(() => win.removeEventListener('storage', onStorage));
    }
  }

  protected send(): void {
    const text = this.message.value.trim();
    if (!text) {
      return;
    }
    this.channel?.postMessage({ from: this.tabId, text, at: now() } satisfies TabNote);
    this.message.reset();
  }

  protected increment(): void {
    // Read, add, write: not atomic across tabs. See the class comment.
    const next = this.readCounter() + 1;
    this.storage.write(COUNTER_KEY, String(next));
    this.counter.set(next);
  }

  private readCounter(): number {
    const value = Number(this.storage.read(COUNTER_KEY) ?? 0);
    return Number.isFinite(value) ? value : 0;
  }
}
