import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../auth/session.service';
import { provideTestHttp } from '../testing/http-testing';
import { sessionResponseFor } from '../testing/session-testing';
import {
  MAX_VISIBLE_MESSAGES,
  NotificationService,
  SNACKBAR_DURATION_MS,
  TOAST_DURATION_MS,
} from './notification.service';

describe('NotificationService', () => {
  let notifications: NotificationService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideTestHttp()] });
    notifications = TestBed.inject(NotificationService);
  });

  afterEach(() => vi.useRealTimers());

  describe('toasts and snackbars', () => {
    it('shows a toast, then lets it go on its own', () => {
      notifications.toast('customers.avatar.done');
      expect(notifications.messages()).toHaveLength(1);
      expect(notifications.messages()[0]).toMatchObject({ kind: 'toast', tone: 'success' });

      vi.advanceTimersByTime(TOAST_DURATION_MS);
      expect(notifications.messages()).toHaveLength(0);
    });

    it('keeps a snackbar longer, because it asks something', () => {
      notifications.snackbar('realtime.customer.updated', {
        actionKey: 'realtime.refresh',
        action: () => undefined,
      });

      vi.advanceTimersByTime(TOAST_DURATION_MS);
      expect(notifications.messages()).toHaveLength(1);
      vi.advanceTimersByTime(SNACKBAR_DURATION_MS - TOAST_DURATION_MS);
      expect(notifications.messages()).toHaveLength(0);
    });

    it("runs a snackbar's action once, and removes the snackbar", () => {
      const action = vi.fn();
      const id = notifications.snackbar('realtime.customer.updated', {
        actionKey: 'realtime.refresh',
        action,
      });

      notifications.act(id);
      notifications.act(id);

      expect(action).toHaveBeenCalledTimes(1);
      expect(notifications.messages()).toHaveLength(0);
    });

    it('can be dismissed before its time, and its timer goes with it', () => {
      const id = notifications.toast('customers.avatar.done');
      notifications.dismiss(id);
      expect(notifications.messages()).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('shows a bounded number at once, dropping the oldest', () => {
      for (let index = 0; index < MAX_VISIBLE_MESSAGES + 2; index++) {
        notifications.toast('customers.avatar.done', { params: { index } });
      }
      const shown = notifications.messages().map((message) => message.params['index']);
      expect(shown).toEqual([2, 3, 4, 5]);
      // Dropped messages do not leave timers behind.
      expect(vi.getTimerCount()).toBe(MAX_VISIBLE_MESSAGES);
    });
  });

  describe('the notification centre', () => {
    it('counts what is unread, newest first', () => {
      notifications.record('realtime.customer.updated', { params: { code: 'C-000001' } });
      notifications.record('realtime.customer.deleted', { params: { code: 'C-000002' } });

      expect(notifications.unreadCount()).toBe(2);
      expect(notifications.entries()[0].params['code']).toBe('C-000002');
    });

    it('marks one entry read', () => {
      const id = notifications.record('realtime.customer.updated');
      notifications.record('realtime.customer.deleted');

      notifications.markRead(id);

      expect(notifications.unreadCount()).toBe(1);
      expect(notifications.entries().find((entry) => entry.id === id)?.read).toBe(true);
    });

    it('marks everything read at once', () => {
      notifications.record('realtime.customer.updated');
      notifications.record('realtime.customer.deleted');

      notifications.markAllRead();

      expect(notifications.unreadCount()).toBe(0);
      expect(notifications.entries()).toHaveLength(2);
    });

    it('forgets everything when the session ends - the next user does not inherit it', async () => {
      const session = TestBed.inject(SessionService);
      const backend = TestBed.inject(HttpTestingController);
      const signedIn = firstValueFrom(session.signIn('admin', 'x'));
      backend.expectOne('/api/auth/login').flush(sessionResponseFor('admin'));
      await signedIn;

      notifications.record('realtime.customer.updated');
      notifications.toast('customers.avatar.done');

      const signedOut = firstValueFrom(session.signOut());
      backend.expectOne('/api/auth/logout').flush(null);
      await signedOut;

      expect(notifications.entries()).toHaveLength(0);
      expect(notifications.messages()).toHaveLength(0);
    });
  });
});
