import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaginationDto, paginatedResponse } from '../common/dto';
import { isResidentRole } from '../common/scope.util';
import { WebhooksService } from '../platform/webhooks.service';

@Injectable()
export class CommunicationsService {
  constructor(private prisma: PrismaService, private webhooks: WebhooksService) {}

  async findAll(orgId: string, query: PaginationDto, role?: string) {
    const { page = 1, limit = 20 } = query;
    const where: any = { organizationId: orgId };
    if (isResidentRole(role)) where.status = 'sent';
    const [data, total] = await Promise.all([
      this.prisma.broadcast.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.broadcast.count({ where }),
    ]);
    return paginatedResponse(data, total, page, limit);
  }

  async create(orgId: string, userId: string, data: any) {
    return this.prisma.broadcast.create({
      data: {
        organizationId: orgId,
        subject: data.subject,
        body: data.body,
        channels: data.channels || ['email'],
        targetSegment: data.targetSegment || {},
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        createdBy: userId,
      },
    });
  }

  async send(id: string) {
    // Mock send - in production would queue to worker-comms
    console.log(`[MOCK] Sending broadcast ${id}`);
    const updated = await this.prisma.broadcast.update({
      where: { id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        stats: { sent: 100, delivered: 98, opened: 45, clicked: 12 },
      },
    });
    // Phase 9.2: notify integrators (e.g. for archive-of-record systems).
    this.webhooks.emit(updated.organizationId, 'broadcast.sent', {
      broadcastId: updated.id,
      subject: updated.subject,
      channels: updated.channels,
      sentAt: updated.sentAt?.toISOString(),
      stats: updated.stats,
    });
    return updated;
  }
}
