import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaginationDto, paginatedResponse } from '../common/dto';
import { PushService } from './push.service';
import { MailService } from '../mail/mail.service';

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
  /**
   * Also send a transactional email (generic "announcement" template) to each
   * recipient. Best-effort; one bad address won't sink the batch.
   */
  alsoEmail?: { subject: string; message: string; ctaLabel?: string; ctaUrl?: string };
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(private prisma: PrismaService, private push: PushService, private mail: MailService) {}

  /** Resolve recipients' emails and send a generic announcement email. */
  private async emailRecipients(input: EnqueueInput) {
    const e = input.alsoEmail;
    if (!e || input.recipientUserIds.length === 0) return;
    const users = await this.prisma.user.findMany({
      where: { id: { in: input.recipientUserIds }, isActive: true },
      select: { id: true, email: true, firstName: true },
    });
    for (const u of users) {
      if (!u.email) continue;
      try {
        await this.mail.enqueue(
          {
            organizationId: input.organizationId,
            templateKey: 'announcement',
            data: {
              recipientFirstName: u.firstName || 'there',
              title: e.subject,
              message: e.message,
              ctaLabel: e.ctaLabel,
              ctaUrl: e.ctaUrl,
            },
            to: u.email,
            toUserId: u.id,
            entityType: input.entityType,
            entityId: input.entityId,
          },
          { force: true },
        );
      } catch (err) {
        this.logger.warn(`announcement email failed for ${u.id}: ${(err as any)?.message ?? err}`);
      }
    }
  }

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

    // Optional email fan-out (generic announcement template).
    if (input.alsoEmail) {
      await this.emailRecipients(input);
    }

    return { created: result.count, broadcastId };
  }

  /**
   * Notify a unit's point(s) of contact — in-app + push + optional email.
   * Targets the flagged primary contact; falls back to an owner occupancy, then
   * to every active occupant. Residents with a linked user account get the
   * in-app + push + email; a contact who has an email but no account still gets
   * the email. Best-effort — never throws into the caller.
   */
  async notifyUnitContacts(input: {
    organizationId: string;
    unitId: string;
    type: string;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
    actionUrl?: string;
    email?: { subject: string; message: string; ctaLabel?: string; ctaUrl?: string };
  }): Promise<{ created: number }> {
    try {
      const occ = await this.prisma.unitOccupancy.findMany({
        where: { unitId: input.unitId, isActive: true },
        include: { person: { select: { id: true, userId: true, email: true, firstName: true } } },
      });
      if (occ.length === 0) return { created: 0 };

      // Prefer the flagged primary contact; else an owner; else everyone active.
      const primary = occ.find((o) => o.isPrimaryContact) || occ.find((o) => o.role === 'owner');
      const targets = primary ? [primary] : occ;

      const userIds = Array.from(
        new Set(targets.map((o) => o.person?.userId).filter((u): u is string => Boolean(u))),
      );

      let created = 0;
      if (userIds.length > 0) {
        const res = await this.enqueueFor({
          organizationId: input.organizationId,
          recipientUserIds: userIds,
          type: input.type,
          title: input.title,
          body: input.body,
          entityType: input.entityType,
          entityId: input.entityId,
          actionUrl: input.actionUrl,
          alsoEmail: input.email,
        });
        created = res.created;
      }

      // Email any target with an address but no linked account (enqueueFor's
      // email fan-out only covers users).
      if (input.email) {
        for (const o of targets) {
          const p = o.person;
          if (!p || p.userId || !p.email) continue;
          await this.emailExternal({
            organizationId: input.organizationId,
            to: p.email,
            recipientName: p.firstName || 'there',
            subject: input.email.subject,
            message: input.email.message,
            ctaLabel: input.email.ctaLabel,
            ctaUrl: input.email.ctaUrl,
            entityType: input.entityType,
            entityId: input.entityId,
          });
        }
      }
      return { created };
    } catch (err) {
      this.logger.warn(`notifyUnitContacts failed for unit ${input.unitId}: ${(err as any)?.message ?? err}`);
      return { created: 0 };
    }
  }

  /**
   * Notify every active user holding one of `roleNames` in the org — in-app +
   * push + optional email. Used for staff-side alerts (e.g. finance officers on
   * a payment, admins on a resident profile change). Best-effort; resolving an
   * empty cohort is a no-op. Excludes the optional `excludeUserId` (e.g. the
   * actor who triggered the event) so people don't get pinged about their own
   * action.
   */
  async notifyByRole(input: {
    organizationId: string;
    roleNames: string[];
    type: string;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
    actionUrl?: string;
    excludeUserId?: string;
    alsoEmail?: { subject: string; message: string; ctaLabel?: string; ctaUrl?: string };
  }): Promise<{ created: number }> {
    try {
      if (input.roleNames.length === 0) return { created: 0 };
      const rows = await this.prisma.userRole.findMany({
        where: {
          organizationId: input.organizationId,
          role: { name: { in: input.roleNames } },
          user: { isActive: true },
        },
        select: { userId: true },
      });
      const userIds = Array.from(new Set(rows.map((r) => r.userId))).filter(
        (id) => id !== input.excludeUserId,
      );
      if (userIds.length === 0) return { created: 0 };
      const res = await this.enqueueFor({
        organizationId: input.organizationId,
        recipientUserIds: userIds,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
        actionUrl: input.actionUrl,
        alsoEmail: input.alsoEmail,
      });
      return { created: res.created };
    } catch (err) {
      this.logger.warn(`notifyByRole failed for ${input.organizationId}: ${(err as any)?.message ?? err}`);
      return { created: 0 };
    }
  }

  /**
   * Send a one-off transactional email to an arbitrary address (e.g. a vendor
   * with no user account) via the generic announcement template. Best-effort.
   */
  async emailExternal(input: {
    organizationId: string;
    to: string;
    recipientName?: string;
    subject: string;
    message: string;
    ctaLabel?: string;
    ctaUrl?: string;
    entityType?: string;
    entityId?: string;
  }): Promise<void> {
    if (!input.to) return;
    try {
      await this.mail.enqueue(
        {
          organizationId: input.organizationId,
          templateKey: 'announcement',
          data: {
            recipientFirstName: input.recipientName || 'there',
            title: input.subject,
            message: input.message,
            ctaLabel: input.ctaLabel,
            ctaUrl: input.ctaUrl,
          },
          to: input.to,
          toName: input.recipientName,
          entityType: input.entityType,
          entityId: input.entityId,
        },
        { force: true },
      );
    } catch (err) {
      this.logger.warn(`external email to ${input.to} failed: ${(err as any)?.message ?? err}`);
    }
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
