import { DatePipe } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  NotificationService,
  type NotificationEntry,
} from '../core/notifications/notification.service';

/**
 * The bell in the header: an unread count, and the history behind it.
 *
 * Toasts disappear; this is where a notification waits until the user has
 * seen it. Opening the panel does **not** mark everything read - seeing that
 * there are five things is not the same as reading five things. An entry is
 * read when it is opened, or when the user says "mark all as read".
 *
 * The button's accessible name carries the count ("Notifications, 3 unread"),
 * because a badge that is only a coloured number tells a screen-reader user
 * nothing.
 */
@Component({
  selector: 'app-notification-center',
  imports: [DatePipe, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'close()' },
  template: `
    <ng-container *transloco="let t">
      <button
        #trigger
        type="button"
        class="bell"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="
          notifications.unreadCount()
            ? t('notifications.centerUnread', { count: notifications.unreadCount() })
            : t('notifications.center')
        "
        (click)="toggle()"
        data-testid="notification-bell"
      >
        <span class="bell__icon" aria-hidden="true"></span>
        @if (notifications.unreadCount()) {
          <span class="bell__count" aria-hidden="true" data-testid="unread-count">{{
            notifications.unreadCount()
          }}</span>
        }
      </button>

      @if (open()) {
        <section
          #panel
          class="panel"
          tabindex="-1"
          [attr.aria-label]="t('notifications.center')"
          data-testid="notification-panel"
        >
          <header class="panel__header">
            <h2 class="panel__heading">{{ t('notifications.center') }}</h2>
            <button
              type="button"
              class="panel__link"
              [disabled]="!notifications.unreadCount()"
              (click)="notifications.markAllRead()"
              data-testid="mark-all-read"
            >
              {{ t('notifications.markAllRead') }}
            </button>
          </header>

          @if (notifications.entries().length) {
            <ul class="panel__list">
              @for (entry of notifications.entries(); track entry.id) {
                <li>
                  <button
                    type="button"
                    class="entry"
                    [class.entry--unread]="!entry.read"
                    (click)="openEntry(entry)"
                    data-testid="notification-entry"
                  >
                    <span class="entry__text">{{ t(entry.messageKey, entry.params) }}</span>
                    <time class="entry__time" [attr.datetime]="entry.at">{{
                      entry.at | date: 'shortTime'
                    }}</time>
                    @if (!entry.read) {
                      <span class="visually-hidden">{{ t('notifications.unread') }}</span>
                    }
                  </button>
                </li>
              }
            </ul>
          } @else {
            <p class="panel__empty">{{ t('notifications.empty') }}</p>
          }
        </section>
      }
    </ng-container>
  `,
  styles: `
    :host {
      position: relative;
    }

    .bell {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border: none;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--text-primary);
      cursor: pointer;
    }

    .bell:hover {
      background-color: var(--surface-hover);
    }

    /* A bell from two shapes: the body is a rounded box, the clapper a dot. */
    .bell__icon {
      position: relative;
      width: 0.875rem;
      height: 0.875rem;
      border: 2px solid currentcolor;
      border-block-end-width: 3px;
      border-radius: 0.5rem 0.5rem 0.1rem 0.1rem;
    }
    .bell__icon::after {
      content: '';
      position: absolute;
      inset-block-end: -0.4rem;
      inset-inline-start: calc(50% - 0.15rem);
      width: 0.3rem;
      height: 0.3rem;
      border-radius: 50%;
      background-color: currentcolor;
    }

    .bell__count {
      position: absolute;
      inset-block-start: 0.1rem;
      inset-inline-end: 0.1rem;
      min-width: 1.1rem;
      padding: 0 0.25rem;
      border-radius: 999px;
      background-color: var(--danger);
      color: var(--text-on-accent);
      font-size: 0.7rem;
      font-weight: var(--weight-semibold);
      line-height: 1.1rem;
      text-align: center;
    }

    .panel {
      position: absolute;
      inset-block-start: calc(100% + var(--space-2));
      inset-inline-end: 0;
      z-index: var(--z-overlay);
      width: min(22rem, calc(100vw - 2 * var(--space-4)));
      max-height: 24rem;
      overflow-y: auto;
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-lg);
      background-color: var(--surface-overlay);
      box-shadow: var(--shadow-lg);
    }

    .panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      padding: var(--space-3);
      border-block-end: var(--border-width) solid var(--border-subtle);
    }

    .panel__heading {
      margin: 0;
      font-size: var(--text-base);
    }

    .panel__link {
      border: none;
      background: transparent;
      color: var(--accent-text);
      font-size: var(--text-sm);
      cursor: pointer;
    }

    .panel__link:disabled {
      color: var(--text-secondary);
      cursor: default;
    }

    .panel__list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .panel__empty {
      padding: var(--space-4) var(--space-3);
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .entry {
      display: flex;
      gap: var(--space-2);
      width: 100%;
      padding: var(--space-3);
      border: none;
      border-block-end: var(--border-width) solid var(--border-subtle);
      background: transparent;
      color: var(--text-secondary);
      font: inherit;
      font-size: var(--text-sm);
      text-align: start;
      cursor: pointer;
    }

    .entry:hover {
      background-color: var(--surface-hover);
    }

    .entry--unread {
      color: var(--text-primary);
      font-weight: var(--weight-medium);
    }

    .entry__text {
      flex: 1;
    }

    .entry__time {
      color: var(--text-secondary);
      white-space: nowrap;
    }
  `,
})
export class NotificationCenter {
  protected readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  protected readonly open = signal(false);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected toggle(): void {
    this.open.update((open) => !open);
    if (this.open()) {
      // Into the panel once it exists, so its contents are next in the
      // reading order rather than somewhere after the rest of the header.
      afterNextRender(() => this.panel()?.nativeElement.focus(), { injector: this.injector });
    }
  }

  protected close(): void {
    if (this.open()) {
      this.open.set(false);
      this.trigger().nativeElement.focus();
    }
  }

  protected openEntry(entry: NotificationEntry): void {
    this.notifications.markRead(entry.id);
    if (entry.link) {
      this.open.set(false);
      void this.router.navigate([...entry.link]);
    }
  }
}
