import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InAppService, NotificationType } from './in-app.service';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function createMockDb() {
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  };
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  };
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
  };

  return {
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    select: vi.fn().mockReturnValue(selectChain),
    _insertChain: insertChain,
    _updateChain: updateChain,
    _selectChain: selectChain,
  };
}

function createMockGateway() {
  return {
    emitToRoom: vi.fn(),
  };
}

const baseNotification = {
  id: 'notif-1',
  type: 'IN_APP' as const,
  recipient: 'user-123',
  payload: { notificationType: 'PACKAGE_CREATED', packageId: 'pkg-1' },
  status: 'PENDING' as const,
  sentAt: null,
  readAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const sentNotification = {
  ...baseNotification,
  status: 'SENT' as const,
  sentAt: new Date('2026-01-01T00:00:01Z'),
};

function buildService() {
  const db = createMockDb();
  const gateway = createMockGateway();
  const service = new InAppService(db as any, gateway as any);
  return { service, db, gateway };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InAppService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('NotificationType enum', () => {
    it('has PACKAGE_CREATED', () => {
      expect(NotificationType.PACKAGE_CREATED).toBe('PACKAGE_CREATED');
    });

    it('has PACKAGE_PROCESSED', () => {
      expect(NotificationType.PACKAGE_PROCESSED).toBe('PACKAGE_PROCESSED');
    });

    it('has JOB_ERROR', () => {
      expect(NotificationType.JOB_ERROR).toBe('JOB_ERROR');
    });

    it('has JOB_STUCK', () => {
      expect(NotificationType.JOB_STUCK).toBe('JOB_STUCK');
    });

    it('has ASSEMBLY_LINE_COMPLETED', () => {
      expect(NotificationType.ASSEMBLY_LINE_COMPLETED).toBe('ASSEMBLY_LINE_COMPLETED');
    });

    it('has ASSEMBLY_LINE_STEP_COMPLETED', () => {
      expect(NotificationType.ASSEMBLY_LINE_STEP_COMPLETED).toBe('ASSEMBLY_LINE_STEP_COMPLETED');
    });
  });

  describe('createNotification', () => {
    it('inserts notification with PENDING status', async () => {
      const { service, db } = buildService();
      db._insertChain.returning.mockResolvedValueOnce([baseNotification]);
      db._updateChain.returning.mockResolvedValueOnce([sentNotification]);

      await service.createNotification(
        NotificationType.PACKAGE_CREATED,
        { packageId: 'pkg-1' },
        'user-123',
      );

      expect(db.insert).toHaveBeenCalledOnce();
      const valuesCall = db._insertChain.values.mock.calls[0][0];
      expect(valuesCall.status).toBe('PENDING');
      expect(valuesCall.type).toBe('IN_APP');
      expect(valuesCall.recipient).toBe('user-123');
    });

    it('stores notificationType in the JSONB payload', async () => {
      const { service, db } = buildService();
      db._insertChain.returning.mockResolvedValueOnce([baseNotification]);
      db._updateChain.returning.mockResolvedValueOnce([sentNotification]);

      await service.createNotification(
        NotificationType.JOB_ERROR,
        { jobId: 'job-1', error: 'OOM' },
        'user-123',
      );

      const valuesCall = db._insertChain.values.mock.calls[0][0];
      expect(valuesCall.payload.notificationType).toBe('JOB_ERROR');
      expect(valuesCall.payload.jobId).toBe('job-1');
    });

    it('transitions status to SENT after insert', async () => {
      const { service, db } = buildService();
      db._insertChain.returning.mockResolvedValueOnce([baseNotification]);
      db._updateChain.returning.mockResolvedValueOnce([sentNotification]);

      await service.createNotification(
        NotificationType.PACKAGE_CREATED,
        { packageId: 'pkg-1' },
        'user-123',
      );

      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateChain.set.mock.calls[0][0];
      expect(setCall.status).toBe('SENT');
      expect(setCall.sentAt).toBeInstanceOf(Date);
    });

    it('pushes notification via Socket.IO to user notification room', async () => {
      const { service, db, gateway } = buildService();
      db._insertChain.returning.mockResolvedValueOnce([baseNotification]);
      db._updateChain.returning.mockResolvedValueOnce([sentNotification]);

      await service.createNotification(
        NotificationType.PACKAGE_CREATED,
        { packageId: 'pkg-1' },
        'user-123',
      );

      expect(gateway.emitToRoom).toHaveBeenCalledOnce();
      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'user:user-123:notifications',
        'notification:new',
        sentNotification,
      );
    });

    it('returns the SENT notification record', async () => {
      const { service, db } = buildService();
      db._insertChain.returning.mockResolvedValueOnce([baseNotification]);
      db._updateChain.returning.mockResolvedValueOnce([sentNotification]);

      const result = await service.createNotification(
        NotificationType.PACKAGE_CREATED,
        { packageId: 'pkg-1' },
        'user-123',
      );

      expect(result.status).toBe('SENT');
      expect(result.id).toBe('notif-1');
    });
  });

  describe('markRead', () => {
    it('updates status to READ and sets readAt', async () => {
      const { service, db } = buildService();
      const readNotification = {
        ...sentNotification,
        status: 'READ' as const,
        readAt: new Date(),
      };
      db._updateChain.returning.mockResolvedValueOnce([readNotification]);

      const result = await service.markRead('notif-1');

      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateChain.set.mock.calls[0][0];
      expect(setCall.status).toBe('READ');
      expect(setCall.readAt).toBeInstanceOf(Date);
      expect(result.status).toBe('READ');
    });

    it('throws when notification not found', async () => {
      const { service, db } = buildService();
      db._updateChain.returning.mockResolvedValueOnce([]);

      await expect(service.markRead('notif-999')).rejects.toThrow(
        'Notification not found: notif-999',
      );
    });
  });

  describe('markAllRead', () => {
    it('marks all SENT notifications as READ for the user', async () => {
      const { service, db } = buildService();
      db._updateChain.returning.mockResolvedValueOnce([
        { id: 'notif-1' },
        { id: 'notif-2' },
        { id: 'notif-3' },
      ]);

      const count = await service.markAllRead('user-123');

      expect(db.update).toHaveBeenCalledOnce();
      const setCall = db._updateChain.set.mock.calls[0][0];
      expect(setCall.status).toBe('READ');
      expect(setCall.readAt).toBeInstanceOf(Date);
      expect(count).toBe(3);
    });

    it('returns 0 when no notifications to mark', async () => {
      const { service, db } = buildService();
      db._updateChain.returning.mockResolvedValueOnce([]);

      const count = await service.markAllRead('user-no-notifications');

      expect(count).toBe(0);
    });
  });

  describe('listNotifications', () => {
    it('returns paginated results with total count', async () => {
      const { service, db } = buildService();
      const data = [sentNotification];

      // First select call returns data, second returns count
      const selectChain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(data),
      };
      const selectChain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      };
      db.select
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2);

      const result = await service.listNotifications('user-123');

      expect(result.data).toEqual(data);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('uses default pagination when not provided', async () => {
      const { service, db } = buildService();
      const selectChain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([]),
      };
      const selectChain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      };
      db.select
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2);

      const result = await service.listNotifications('user-123');

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(selectChain1.limit).toHaveBeenCalledWith(20);
      expect(selectChain1.offset).toHaveBeenCalledWith(0);
    });

    it('respects custom pagination', async () => {
      const { service, db } = buildService();
      const selectChain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([]),
      };
      const selectChain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      };
      db.select
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2);

      const result = await service.listNotifications(
        'user-123',
        undefined,
        { page: 3, limit: 10 },
      );

      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(selectChain1.limit).toHaveBeenCalledWith(10);
      expect(selectChain1.offset).toHaveBeenCalledWith(20); // (3-1)*10
    });

    it('caps limit at MAX_LIMIT (100)', async () => {
      const { service, db } = buildService();
      const selectChain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([]),
      };
      const selectChain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      };
      db.select
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2);

      const result = await service.listNotifications(
        'user-123',
        undefined,
        { limit: 500 },
      );

      expect(result.limit).toBe(100);
      expect(selectChain1.limit).toHaveBeenCalledWith(100);
    });

    it('enforces minimum page of 1', async () => {
      const { service, db } = buildService();
      const selectChain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([]),
      };
      const selectChain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      };
      db.select
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2);

      const result = await service.listNotifications(
        'user-123',
        undefined,
        { page: -1 },
      );

      expect(result.page).toBe(1);
      expect(selectChain1.offset).toHaveBeenCalledWith(0);
    });

    it('returns empty data when no notifications', async () => {
      const { service, db } = buildService();
      const selectChain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([]),
      };
      const selectChain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      };
      db.select
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2);

      const result = await service.listNotifications('user-empty');

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('applies type filter', async () => {
      const { service, db } = buildService();
      const selectChain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([]),
      };
      const selectChain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      };
      db.select
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2);

      await service.listNotifications('user-123', {
        type: NotificationType.JOB_ERROR,
      });

      // The where clause should have been called (filter applied)
      expect(selectChain1.where).toHaveBeenCalled();
    });

    it('applies status filter', async () => {
      const { service, db } = buildService();
      const selectChain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([]),
      };
      const selectChain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      };
      db.select
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2);

      await service.listNotifications('user-123', { status: 'READ' });

      expect(selectChain1.where).toHaveBeenCalled();
    });

    it('applies date range filters', async () => {
      const { service, db } = buildService();
      const selectChain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([]),
      };
      const selectChain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      };
      db.select
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2);

      await service.listNotifications('user-123', {
        after: '2026-01-01T00:00:00Z',
        before: new Date('2026-12-31T23:59:59Z'),
      });

      expect(selectChain1.where).toHaveBeenCalled();
    });

    it('handles Date objects for after and strings for before', async () => {
      const { service, db } = buildService();
      const selectChain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([]),
      };
      const selectChain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      };
      db.select
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2);

      await service.listNotifications('user-123', {
        after: new Date('2026-01-01T00:00:00Z'),
        before: '2026-12-31T23:59:59Z',
      });

      expect(selectChain1.where).toHaveBeenCalled();
    });
  });

  describe('getUnreadCount', () => {
    it('returns count of SENT notifications for the user', async () => {
      const { service, db } = buildService();
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 5 }]),
      };
      db.select.mockReturnValueOnce(selectChain);

      const count = await service.getUnreadCount('user-123');

      expect(count).toBe(5);
    });

    it('returns 0 when no unread notifications', async () => {
      const { service, db } = buildService();
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      };
      db.select.mockReturnValueOnce(selectChain);

      const count = await service.getUnreadCount('user-no-unread');

      expect(count).toBe(0);
    });

    it('returns 0 when query returns empty result', async () => {
      const { service, db } = buildService();
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      db.select.mockReturnValueOnce(selectChain);

      const count = await service.getUnreadCount('user-empty');

      expect(count).toBe(0);
    });
  });

  describe('injectable', () => {
    it('is an injectable NestJS service', () => {
      const { service } = buildService();
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(InAppService);
    });
  });
});
