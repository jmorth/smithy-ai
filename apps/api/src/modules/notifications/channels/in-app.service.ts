import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleClient } from '../../../database/database.provider';
import { notifications } from '../../../database/schema';
import { WorkflowsGateway } from '../../realtime/workflows.gateway';

export const NotificationType = {
  PACKAGE_CREATED: 'PACKAGE_CREATED',
  PACKAGE_PROCESSED: 'PACKAGE_PROCESSED',
  JOB_ERROR: 'JOB_ERROR',
  JOB_STUCK: 'JOB_STUCK',
  ASSEMBLY_LINE_COMPLETED: 'ASSEMBLY_LINE_COMPLETED',
  ASSEMBLY_LINE_STEP_COMPLETED: 'ASSEMBLY_LINE_STEP_COMPLETED',
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export type NotificationPayload = Record<string, unknown>;

export type NotificationRecord = typeof notifications.$inferSelect;

export interface NotificationFilters {
  type?: NotificationType;
  status?: 'PENDING' | 'SENT' | 'READ';
  after?: Date | string;
  before?: Date | string;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginatedNotifications {
  data: NotificationRecord[];
  total: number;
  page: number;
  limit: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class InAppService {
  private readonly logger = new Logger(InAppService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleClient,
    private readonly workflowsGateway: WorkflowsGateway,
  ) {}

  async createNotification(
    type: NotificationType,
    payload: NotificationPayload,
    recipientId: string,
  ): Promise<NotificationRecord> {
    const [record] = await this.db
      .insert(notifications)
      .values({
        type: 'IN_APP',
        recipient: recipientId,
        payload: { ...payload, notificationType: type },
        status: 'PENDING',
      })
      .returning();

    const notification = record!;

    // Transition to SENT (confirming persistence)
    const [updated] = await this.db
      .update(notifications)
      .set({ status: 'SENT', sentAt: new Date() })
      .where(eq(notifications.id, notification.id))
      .returning();

    const sentNotification = updated!;

    // Push via Socket.IO
    this.workflowsGateway.emitToRoom(
      `user:${recipientId}:notifications`,
      'notification:new',
      sentNotification,
    );

    this.logger.debug(
      `In-app notification created: id=${sentNotification.id} type=${type} recipient=${recipientId}`,
    );

    return sentNotification;
  }

  async markRead(notificationId: string): Promise<NotificationRecord> {
    const now = new Date();
    const [updated] = await this.db
      .update(notifications)
      .set({ status: 'READ', readAt: now })
      .where(eq(notifications.id, notificationId))
      .returning();

    if (!updated) {
      throw new Error(`Notification not found: ${notificationId}`);
    }

    return updated;
  }

  async markAllRead(recipientId: string): Promise<number> {
    const now = new Date();
    const result = await this.db
      .update(notifications)
      .set({ status: 'READ', readAt: now })
      .where(
        and(
          eq(notifications.recipient, recipientId),
          eq(notifications.status, 'SENT'),
          eq(notifications.type, 'IN_APP'),
        ),
      )
      .returning({ id: notifications.id });

    return result.length;
  }

  async listNotifications(
    recipientId: string,
    filters?: NotificationFilters,
    pagination?: PaginationOptions,
  ): Promise<PaginatedNotifications> {
    const page = Math.max(pagination?.page ?? DEFAULT_PAGE, 1);
    const limit = Math.min(
      Math.max(pagination?.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const offset = (page - 1) * limit;

    const conditions = [
      eq(notifications.recipient, recipientId),
      eq(notifications.type, 'IN_APP'),
    ];

    if (filters?.type) {
      conditions.push(
        sql`${notifications.payload}->>'notificationType' = ${filters.type}`,
      );
    }

    if (filters?.status) {
      conditions.push(eq(notifications.status, filters.status));
    }

    if (filters?.after) {
      const afterDate =
        filters.after instanceof Date
          ? filters.after
          : new Date(filters.after);
      conditions.push(gte(notifications.createdAt, afterDate));
    }

    if (filters?.before) {
      const beforeDate =
        filters.before instanceof Date
          ? filters.before
          : new Date(filters.before);
      conditions.push(lte(notifications.createdAt, beforeDate));
    }

    const whereClause = and(...conditions);

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(whereClause)
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(notifications)
        .where(whereClause),
    ]);

    return {
      data,
      total: totalResult[0]?.count ?? 0,
      page,
      limit,
    };
  }

  async getUnreadCount(recipientId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipient, recipientId),
          eq(notifications.status, 'SENT'),
          eq(notifications.type, 'IN_APP'),
        ),
      );

    return result[0]?.count ?? 0;
  }
}
