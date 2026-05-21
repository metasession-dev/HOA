import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaginationDto, paginatedResponse } from '../common/dto';
import { PushService } from './push.service';

export type EnqueueInput = {
  organizationId: string;
  recipientUserIds: string[];
  type: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  alsoBroadcast?: { channels: string[]; createdBy: string };
  /** Phase 10.1: also dispatch a Web Push for each recipient (best-effort). */
  alsoPush?: boolean;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(private prisma: PrismaService, private push: PushService) {}

  /**
   * Persist a Notification per recipient. Optionally also write a queued
   * Broadcast row for later dispatch by the comms worker (Phase 2.2).
   * De-duplicated by (recipientUserId, type, entityId) when entityId is set.
   */
  async enqueueFor(input: EnqueueInput) {
    const { organizationId, recipientUserIds, type, title, body, entityType, entityId, actionUrl } = input;
    if (recipientUserIds.length === 0) return { created: 0, broadcastId: null };

    const rows = recipientUserIds.map((recipientUserId) => ({
      organizationId,
      recipientUserId,
      type,
      title,
      body,
      entityType,
      entityId,
      actionUrl,
    }));

    const result = await this.prisma.notification.createMany({ data: rows, skipDuplicates: true });

    let broadcastId: string | null = null;
    if (input.alsoBroadcast) {
      const broadcast = await this.prisma.broadcast.create({
        data: {
          organizationId,
          subject: title,
          body,
          channels: input.alsoBroadcast.channels,
          targetSegment: { recipientUserIds, type, entityType, entityId } as any,
          status: 'queued',
          createdBy: input.alsoBroadcast.createdBy,
        },
      });
      broadcastId = broadcast.id;
    }

    // Phase 10.1: best-effort Web Push fan-out. Defaults to on when no
    // explicit choice is made — most callers want the bell + the push.
    if (input.alsoPush !== false) {
      this.push
        .sendToUsers(recipientUserIds, {
          title,
          body,
          url: actionUrl || '/notifications',
          tag: entityId ? `${type}:${entityId}` : type,
        })
        .catch((err) => this.logger.warn(`push fan-out failed: ${err?.message ?? err}`));
    }

    return { created: result.count, broadcastId };
  }

  async listForUser(userId: string, query: PaginationDto & { unread?: string }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 30));
    const where: any = { recipientUserId: userId };
    if (query.unread === 'true') where.readAt = null;

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return paginatedResponse(data, total, page, limit);
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { recipientUserId: userId, readAt: null },
    });
    return { count };
  }

  async markRead(id: string, userId: string) {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n) throw new NotFoundException('Notification not found');
    if (n.recipientUserId !== userId) throw new ForbiddenException();
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { recipientUserId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
