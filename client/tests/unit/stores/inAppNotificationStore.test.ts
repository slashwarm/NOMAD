import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../helpers/msw/server';
import { useInAppNotificationStore } from '../../../src/store/inAppNotificationStore';
import { resetAllStores } from '../../helpers/store';

// Raw notification factory matching the server shape (is_read as 0/1, params as strings)
function buildRawNotif(overrides: Record<string, unknown> = {}) {
  const id = Math.floor(Math.random() * 100000);
  return {
    id,
    type: 'simple',
    scope: 'trip',
    target: 1,
    sender_id: 2,
    sender_username: 'alice',
    sender_avatar: null,
    recipient_id: 1,
    title_key: 'notif.title',
    title_params: '{}',
    text_key: 'notif.text',
    text_params: '{}',
    positive_text_key: null,
    negative_text_key: null,
    response: null,
    navigate_text_key: null,
    navigate_target: null,
    is_read: 0,
    created_at: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  resetAllStores();
});

describe('inAppNotificationStore', () => {
  describe('FE-NOTIF-001: fetchNotifications() loads first page', () => {
    it('populates notifications, total, and unreadCount', async () => {
      await useInAppNotificationStore.getState().fetchNotifications();
      const state = useInAppNotificationStore.getState();

      expect(state.notifications.length).toBeGreaterThan(0);
      expect(state.total).toBeGreaterThan(0);
      expect(state.unreadCount).toBe(5);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('FE-NOTIF-002: Pagination — loading more appends to list', () => {
    it('appends additional notifications when fetchNotifications is called again', async () => {
      // First page
      await useInAppNotificationStore.getState().fetchNotifications(true);
      const firstPageCount = useInAppNotificationStore.getState().notifications.length;
      const total = useInAppNotificationStore.getState().total;

      // Only test pagination if there are more items
      if (firstPageCount < total) {
        await useInAppNotificationStore.getState().fetchNotifications();
        const state = useInAppNotificationStore.getState();
        expect(state.notifications.length).toBeGreaterThan(firstPageCount);
      } else {
        // All notifications fit in one page
        expect(firstPageCount).toBe(total);
      }
    });
  });

  describe('FE-NOTIF-003: markRead(id)', () => {
    it('updates is_read to true for the notification', async () => {
      // Seed with an unread notification
      const unread = buildRawNotif({ id: 42, is_read: 0 });
      useInAppNotificationStore.setState({
        notifications: [{ ...unread, title_params: {}, text_params: {}, is_read: false }] as never,
        unreadCount: 1,
      });

      await useInAppNotificationStore.getState().markRead(42);
      const state = useInAppNotificationStore.getState();

      const notif = state.notifications.find((n) => n.id === 42);
      expect(notif?.is_read).toBe(true);
      expect(state.unreadCount).toBe(0);
    });
  });

  describe('FE-NOTIF-004: handleNewNotification() prepends to list', () => {
    it('adds a new notification at the start of the list', () => {
      // Seed existing notifications
      useInAppNotificationStore.setState({
        notifications: [{ ...buildRawNotif({ id: 1 }), title_params: {}, text_params: {}, is_read: false }] as never,
        total: 1,
        unreadCount: 1,
      });

      const newRaw = buildRawNotif({ id: 99 });
      useInAppNotificationStore.getState().handleNewNotification(newRaw as never);

      const state = useInAppNotificationStore.getState();
      expect(state.notifications[0].id).toBe(99);
      expect(state.notifications.length).toBe(2);
      expect(state.total).toBe(2);
      expect(state.unreadCount).toBe(2);
    });
  });

  describe('FE-NOTIF-005: handleUpdatedNotification() updates existing notification', () => {
    it('replaces the notification in the list', () => {
      useInAppNotificationStore.setState({
        notifications: [{ ...buildRawNotif({ id: 7, is_read: 0 }), title_params: {}, text_params: {}, is_read: false }] as never,
        total: 1,
        unreadCount: 1,
      });

      const updated = buildRawNotif({ id: 7, is_read: 1 });
      useInAppNotificationStore.getState().handleUpdatedNotification(updated as never);

      const state = useInAppNotificationStore.getState();
      const notif = state.notifications.find((n) => n.id === 7);
      expect(notif?.is_read).toBe(true);
    });
  });

  describe('FE-NOTIF-006: Unread count is correct', () => {
    it('unreadCount matches the number of unread notifications', async () => {
      await useInAppNotificationStore.getState().fetchNotifications(true);
      const state = useInAppNotificationStore.getState();

      // The mock returns 5 unread from the server
      expect(state.unreadCount).toBe(5);
    });
  });
});
