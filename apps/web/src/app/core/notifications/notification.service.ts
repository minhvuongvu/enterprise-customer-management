import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SessionService } from '../auth/session.service';
import { now, type Instant } from '../time/instant';

/**
 * The application's notifications: transient messages on screen, and the
 * notification centre's history.
 *
 * ## Why this is global state
 *
 * The rule in this repository is that state lives with the feature that owns
 * it (ADR-0013). This is one of the few exceptions, and it earns it on two
 * counts: the things that produce notifications (realtime events, an import,
 * a failed optimistic update) and the things that show them (the toast region
 * and the bell in the header) live in different parts of the component tree,
 * and a notification must survive the navigation that often follows it. A
 * store scoped to a route would be destroyed before the user read it.
 * ADR-0022.
 *
 * ## Three kinds of message, one vocabulary
 *
 * | Kind        | Stays          | Has an action | Use for                                    |
 * | ----------- | -------------- | ------------- | ------------------------------------------ |
 * | toast       | a few seconds  | no            | "done" - the outcome of the user's action  |
 * | snackbar    | longer         | one           | news the user may want to act on ("Refresh") |
 * | centre entry| until read     | a link        | anything worth finding again later         |
 *
 * Every message is a translation key and its parameters - never a sentence,
 * and never a server's own text.
 *
 * ## Privacy
 *
 * The centre's history is about customers. It is cleared when the session
 * ends, so the next person to sign in on this tab does not inherit it.
 */

export type NotificationTone = 'info' | 'success' | 'warning' | 'danger';

export type MessageParams = Readonly<Record<string, string | number>>;

export interface TransientMessage {
  readonly id: number;
  readonly kind: 'toast' | 'snackbar';
  readonly messageKey: string;
  readonly params: MessageParams;
  readonly tone: NotificationTone;
  readonly action: { readonly labelKey: string; readonly run: () => void } | null;
}

export interface NotificationEntry {
  readonly id: number;
  readonly messageKey: string;
  readonly params: MessageParams;
  readonly tone: NotificationTone;
  /** UTC ISO-8601; formatted only when rendered. */
  readonly at: Instant;
  readonly read: boolean;
  /** Router commands for "take me there", if there is a there. */
  readonly link: readonly string[] | null;
}

/** How long a message stays unless dismissed. A snackbar waits longer: it asks something. */
export const TOAST_DURATION_MS = 5_000;
export const SNACKBAR_DURATION_MS = 10_000;
/** Messages on screen at once. More than this is noise, and the oldest go first. */
export const MAX_VISIBLE_MESSAGES = 4;
/**
 * The least time a message is left on screen after the user stops hovering or
 * focusing it. Resuming with the few milliseconds that were left would make
 * it vanish the moment the pointer moved off - which is the opposite of what
 * pausing is for.
 */
export const RESUME_MINIMUM_MS = 2_000;
/** History kept in the centre. Older entries are dropped, not paged. */
export const MAX_CENTRE_ENTRIES = 50;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 1;
  /**
   * One dismissal timer per message on screen. `remaining` is what is left
   * of its time; `handle` is null while the timers are held.
   */
  private readonly timers = new Map<
    number,
    { handle: ReturnType<typeof setTimeout> | null; remaining: number; startedAt: number }
  >();
  private held = false;

  private readonly messageState = signal<readonly TransientMessage[]>([]);
  private readonly entryState = signal<readonly NotificationEntry[]>([]);

  readonly messages = this.messageState.asReadonly();
  readonly entries = this.entryState.asReadonly();
  readonly unreadCount = computed(() => this.entryState().filter((entry) => !entry.read).length);

  constructor() {
    inject(SessionService)
      .ended$.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.clearAll());
  }

  /** The outcome of something the user just did. */
  toast(
    messageKey: string,
    options: { tone?: NotificationTone; params?: MessageParams } = {},
  ): number {
    return this.show({
      kind: 'toast',
      messageKey,
      params: options.params ?? {},
      tone: options.tone ?? 'success',
      action: null,
    });
  }

  /** News with one thing the user can do about it. */
  snackbar(
    messageKey: string,
    options: {
      actionKey: string;
      action: () => void;
      tone?: NotificationTone;
      params?: MessageParams;
    },
  ): number {
    return this.show({
      kind: 'snackbar',
      messageKey,
      params: options.params ?? {},
      tone: options.tone ?? 'info',
      action: { labelKey: options.actionKey, run: options.action },
    });
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this.messageState.update((messages) => messages.filter((message) => message.id !== id));
  }

  /**
   * Stops every message from dismissing itself, for as long as the user is
   * pointing at or focused inside the messages (WCAG 2.2.1, timing
   * adjustable). A message someone is reading, or whose action button has
   * focus, must not disappear underneath them. Debt row 23.
   */
  hold(): void {
    if (this.held) {
      return;
    }
    this.held = true;
    const now = Date.now();
    for (const timer of this.timers.values()) {
      if (timer.handle !== null) {
        clearTimeout(timer.handle);
        timer.handle = null;
        timer.remaining = Math.max(0, timer.remaining - (now - timer.startedAt));
      }
    }
  }

  /** Lets the messages dismiss themselves again, each with what it had left. */
  release(): void {
    if (!this.held) {
      return;
    }
    this.held = false;
    for (const [id, timer] of this.timers) {
      this.start(id, Math.max(timer.remaining, RESUME_MINIMUM_MS));
    }
  }

  /** Runs a snackbar's action, then removes it: an answered question is gone. */
  act(id: number): void {
    const message = this.messageState().find((candidate) => candidate.id === id);
    this.dismiss(id);
    message?.action?.run();
  }

  /** Adds an entry to the notification centre. Newest first. */
  record(
    messageKey: string,
    options: { tone?: NotificationTone; params?: MessageParams; link?: readonly string[] } = {},
  ): number {
    const id = this.nextId++;
    const entry: NotificationEntry = {
      id,
      messageKey,
      params: options.params ?? {},
      tone: options.tone ?? 'info',
      at: now(),
      read: false,
      link: options.link ?? null,
    };
    this.entryState.update((entries) => [entry, ...entries].slice(0, MAX_CENTRE_ENTRIES));
    return id;
  }

  markRead(id: number): void {
    this.entryState.update((entries) =>
      entries.map((entry) => (entry.id === id && !entry.read ? { ...entry, read: true } : entry)),
    );
  }

  markAllRead(): void {
    this.entryState.update((entries) =>
      entries.some((entry) => !entry.read)
        ? entries.map((entry) => (entry.read ? entry : { ...entry, read: true }))
        : entries,
    );
  }

  private show(message: Omit<TransientMessage, 'id'>): number {
    const id = this.nextId++;
    this.messageState.update((messages) => {
      const next = [...messages, { ...message, id }];
      for (const dropped of next.slice(0, Math.max(0, next.length - MAX_VISIBLE_MESSAGES))) {
        this.clearTimer(dropped.id);
      }
      return next.slice(-MAX_VISIBLE_MESSAGES);
    });
    const duration = message.kind === 'snackbar' ? SNACKBAR_DURATION_MS : TOAST_DURATION_MS;
    if (this.held) {
      // Arrived while the user is reading the others: it waits with them.
      this.timers.set(id, { handle: null, remaining: duration, startedAt: Date.now() });
    } else {
      this.start(id, duration);
    }
    return id;
  }

  private start(id: number, duration: number): void {
    this.timers.set(id, {
      handle: setTimeout(() => this.dismiss(id), duration),
      remaining: duration,
      startedAt: Date.now(),
    });
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      if (timer.handle !== null) {
        clearTimeout(timer.handle);
      }
      this.timers.delete(id);
    }
  }

  private clearAll(): void {
    for (const timer of this.timers.values()) {
      if (timer.handle !== null) {
        clearTimeout(timer.handle);
      }
    }
    this.timers.clear();
    this.held = false;
    this.messageState.set([]);
    this.entryState.set([]);
  }
}
