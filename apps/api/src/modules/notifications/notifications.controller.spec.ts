import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';

const sentNotification = {
  id: 'notif-1',
  type: 'IN_APP' as const,
  recipient: 'user-123',
  payload: { notificationType: 'PACKAGE_CREATED', packageId: 'pkg-1' },
  status: 'SENT' as const,
  sentAt: new Date('2026-01-01T00:00:01Z'),
  readAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const readNotification = {
  ...sentNotification,
  status: 'READ' as const,
  readAt: new Date('2026-01-01T00:01:00Z'),
};

const webhookEndpoint = {
  id: 'ep-1',
  url: 'https://example.com/hook',
  secret: 'test-secret',
  events: ['assembly-line.completed'],
  ownerId: 'user-123',
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastDeliveryAt: null,
  lastDeliveryStatus: null,
};

function createMockInAppService() {
  return {
    listNotifications: vi.fn().mockResolvedValue({
      data: [sentNotification],
      total: 1,
      page: 1,
      limit: 20,
    }),
    markRead: vi.fn().mockResolvedValue(readNotification),
    markAllRead: vi.fn().mockResolvedValue(3),
    getUnreadCount: vi.fn().mockResolvedValue(5),
  };
}

function createMockWebhookService() {
  return {
    registerEndpoint: vi.fn().mockResolvedValue(webhookEndpoint),
    listEndpoints: vi.fn().mockResolvedValue([webhookEndpoint]),
    deleteEndpoint: vi.fn().mockResolvedValue(undefined),
  };
}

function buildController() {
  const inAppService = createMockInAppService();
  const webhookService = createMockWebhookService();
  const controller = new NotificationsController(
    inAppService as any,
    webhookService as any,
  );
  return { controller, inAppService, webhookService };
}

const user = { id: 'user-123' };

describe('NotificationsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock global fetch for test ping
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
  });

  describe('GET /notifications', () => {
    it('returns paginated notifications with unread count in meta', async () => {
      const { controller, inAppService } = buildController();

      const result = await controller.listNotifications(user, {
        page: 1,
        limit: 20,
      });

      expect(inAppService.listNotifications).toHaveBeenCalledWith(
        'user-123',
        { status: undefined, type: undefined },
        { page: 1, limit: 20 },
      );
      expect(inAppService.getUnreadCount).toHaveBeenCalledWith('user-123');
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        unreadCount: 5,
      });
    });

    it('passes status and type filters to service', async () => {
      const { controller, inAppService } = buildController();

      await controller.listNotifications(user, {
        status: 'SENT',
        type: 'JOB_ERROR',
        page: 2,
        limit: 10,
      });

      expect(inAppService.listNotifications).toHaveBeenCalledWith(
        'user-123',
        { status: 'SENT', type: 'JOB_ERROR' },
        { page: 2, limit: 10 },
      );
    });
  });

  describe('PATCH /notifications/:id/read', () => {
    it('marks a notification as read', async () => {
      const { controller, inAppService } = buildController();

      const result = await controller.markRead(user, 'notif-1');

      expect(inAppService.markRead).toHaveBeenCalledWith('notif-1');
      expect(result.status).toBe('READ');
    });

    it('throws NotFoundException when notification not found', async () => {
      const { controller, inAppService } = buildController();
      inAppService.markRead.mockRejectedValue(
        new Error('Notification not found: notif-999'),
      );

      await expect(
        controller.markRead(user, 'notif-999'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when notification belongs to different user', async () => {
      const { controller, inAppService } = buildController();
      inAppService.markRead.mockResolvedValue({
        ...readNotification,
        recipient: 'other-user',
      });

      await expect(
        controller.markRead(user, 'notif-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('re-throws non-not-found errors', async () => {
      const { controller, inAppService } = buildController();
      inAppService.markRead.mockRejectedValue(new Error('DB connection failed'));

      await expect(
        controller.markRead(user, 'notif-1'),
      ).rejects.toThrow('DB connection failed');
    });

    it('re-throws NotFoundException directly', async () => {
      const { controller, inAppService } = buildController();
      inAppService.markRead.mockRejectedValue(
        new NotFoundException('Already a NotFoundException'),
      );

      await expect(
        controller.markRead(user, 'notif-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PATCH /notifications/read-all', () => {
    it('marks all notifications as read and returns count', async () => {
      const { controller, inAppService } = buildController();

      const result = await controller.markAllRead(user);

      expect(inAppService.markAllRead).toHaveBeenCalledWith('user-123');
      expect(result).toEqual({ updatedCount: 3 });
    });
  });

  describe('POST /webhook-endpoints', () => {
    it('creates a webhook endpoint and sends test ping', async () => {
      const { controller, webhookService } = buildController();

      const result = await controller.createWebhookEndpoint(user, {
        url: 'https://example.com/hook',
        secret: 'my-secret',
        events: ['assembly-line.completed'],
      });

      expect(webhookService.registerEndpoint).toHaveBeenCalledWith(
        'https://example.com/hook',
        'my-secret',
        ['assembly-line.completed'],
        'user-123',
      );
      expect(result.id).toBe('ep-1');
    });

    it('does not throw if test ping fails', async () => {
      const { controller } = buildController();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Connection refused')),
      );

      const result = await controller.createWebhookEndpoint(user, {
        url: 'https://example.com/hook',
        secret: 'my-secret',
        events: ['assembly-line.completed'],
      });

      expect(result.id).toBe('ep-1');
    });
  });

  describe('GET /webhook-endpoints', () => {
    it('returns webhook endpoints for the authenticated user', async () => {
      const { controller, webhookService } = buildController();

      const result = await controller.listWebhookEndpoints(user);

      expect(webhookService.listEndpoints).toHaveBeenCalledWith('user-123');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ep-1');
    });
  });

  describe('DELETE /webhook-endpoints/:id', () => {
    it('deletes an owned webhook endpoint', async () => {
      const { controller, webhookService } = buildController();

      await controller.deleteWebhookEndpoint(user, 'ep-1');

      expect(webhookService.listEndpoints).toHaveBeenCalledWith('user-123');
      expect(webhookService.deleteEndpoint).toHaveBeenCalledWith('ep-1');
    });

    it('throws NotFoundException when endpoint not found or not owned', async () => {
      const { controller, webhookService } = buildController();
      webhookService.listEndpoints.mockResolvedValue([]);

      await expect(
        controller.deleteWebhookEndpoint(user, 'ep-999'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
