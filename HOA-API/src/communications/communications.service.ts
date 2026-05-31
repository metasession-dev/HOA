import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaginationDto, paginatedResponse } from '../common/dto';
import { isResidentRole } from '../common/scope.util';
import { WebhooksService } from '../platform/webhooks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { StorageService } from '../storage/storage.service';

// Public origin of THIS API, so signed attachment links in emails are absolute
// and fetchable by Resend. Must be set to the public API URL in production.
const API_BASE = (
  process.env.API_PUBLIC_URL || process.env.PUBLIC_API_URL || 'http://localhost:3003'
).replace(/\/$/, '');
// Files we attach to the email itself (vs link only). Email size limits make
// real attachments unsuitable for video / very large files.
const EMAIL_ATTACH_MAX_BYTES = 20 * 1024 * 1024;
function isEmailAttachable(contentType?: string, size?: number): boolean {
  if (typeof size === 'number' && size > EMAIL_ATTACH_MAX_BYTES) return false;
  return /^image\//.test(contentType || '') || contentType === 'application/pdf';
}

@Injectable()
export class CommunicationsService {
  constructor(
    private prisma: PrismaService,
    private webhooks: WebhooksService,
    private notifications: NotificationsService,
    private mail: MailService,
    private storage: StorageService,
  ) {}

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
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        createdBy: userId,
      },
    });
  }

  /**
   * Single notice for a reader. Org-scoped (multi-tenant guard). Residents may
   * only read notices that have actually gone out — drafts/cancelled ones 404
   * for them so nothing leaks before send.
   */
  async findOne(orgId: string, id: string, role?: string) {
    const b = await this.prisma.broadcast.findFirst({ where: { id, organizationId: orgId } });
    if (!b) throw new NotFoundException('Notice not found');
    if (isResidentRole(role) && !['sent', 'sending', 'queued'].includes(b.status)) {
      throw new NotFoundException('Notice not found');
    }
    return {
      id: b.id,
      subject: b.subject,
      body: b.body,
      channels: b.channels,
      attachments: b.attachments ?? [],
      status: b.status,
      sentAt: b.sentAt ?? b.createdAt,
      createdAt: b.createdAt,
    };
  }

  async send(id: string, orgId: string) {
    // Org-scoped + idempotent. The CAS update only flips a not-yet-sent
    // broadcast belonging to this org, so:
    //   • an admin can't trigger another org's broadcast (multi-tenant guard)
    //   • a double-click / retry won't re-fan-out (no duplicate notifications)
    const cas = await this.prisma.broadcast.updateMany({
      where: { id, organizationId: orgId, status: { not: 'sent' } },
      data: { status: 'sent', sentAt: new Date() },
    });
    if (cas.count === 0) {
      const current = await this.prisma.broadcast.findFirst({ where: { id, organizationId: orgId } });
      if (!current) throw new NotFoundException('Broadcast not found');
      return current; // already sent → no-op (idempotent)
    }
    const updated = await this.prisma.broadcast.findFirstOrThrow({ where: { id, organizationId: orgId } });

    // Resolve the resident audience once, then fan out across channels:
    //   • in-app Notification (bell + unread count) + Web Push  — always
    //   • email                                                 — when 'email' is a selected channel
    const recipients = await this.residentRecipients(updated.organizationId);
    const recipientUserIds = recipients.map((r) => r.userId);

    let delivered = 0;
    if (recipientUserIds.length > 0) {
      const res = await this.notifications.enqueueFor({
        organizationId: updated.organizationId,
        recipientUserIds,
        type: 'broadcast',
        title: updated.subject,
        body: updated.body,
        entityType: 'Broadcast',
        entityId: updated.id,
        actionUrl: '/notices',
      });
      delivered = res.created;
    }

    // Email dispatch — enqueue one transactional email per recipient when the
    // broadcast targets the email channel. The email worker (drains every 30s)
    // sends via Resend (or the mock provider in dev). De-duped per
    // (broadcast, recipient) by the EmailDelivery unique index, so a repeat
    // send is a no-op rather than a double-send.
    // Resolve attachment links once for the whole broadcast. For files with a
    // storedFileId we mint a fresh long-TTL signed absolute URL (so links stay
    // valid in the inbox and Resend can fetch the real attachments). Legacy
    // rows without an id fall back to their stored url.
    const rawAtts: any[] = Array.isArray((updated as any).attachments) ? (updated as any).attachments : [];
    const signedAtts = rawAtts.map((a) => {
      let url: string = a.url;
      if (a.storedFileId) {
        try {
          url = `${API_BASE}${this.storage.signUrl(a.storedFileId, 7 * 24 * 3600).url}`;
        } catch { /* keep stored url */ }
      } else if (url && !/^https?:\/\//i.test(url)) {
        url = `${API_BASE}${url}`;
      }
      return { filename: a.filename, url, contentType: a.contentType, size: a.size };
    });
    const emailLinks = signedAtts.map((a) => ({ filename: a.filename, url: a.url }));
    const realAttachments = signedAtts
      .filter((a) => isEmailAttachable(a.contentType, a.size))
      .map((a) => ({ filename: a.filename, path: a.url }));

    let emailed = 0;
    if ((updated.channels || []).includes('email')) {
      // Respect opt-outs (POPIA/GDPR). A global opt-out (topic=null) suppresses
      // everything; a topic-scoped opt-out suppresses matching broadcasts.
      const optOuts = await this.prisma.broadcastOptOut.findMany({
        where: {
          organizationId: updated.organizationId,
          OR: [{ topic: updated.optOutTopic ?? null }, { topic: null }],
        },
        select: { email: true },
      });
      const optedOut = new Set(optOuts.map((o) => o.email.toLowerCase()));
      for (const r of recipients) {
        if (!r.email) continue;
        if (optedOut.has(r.email.toLowerCase())) continue;
        try {
          await this.mail.enqueue({
            organizationId: updated.organizationId,
            templateKey: 'broadcast',
            data: {
              recipientFirstName: r.firstName || 'there',
              subject: updated.subject,
              body: updated.body,
              attachments: emailLinks,
            },
            to: r.email,
            toName: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || undefined,
            toUserId: r.userId,
            entityType: 'Broadcast',
            entityId: updated.id,
            attachments: realAttachments,
          });
          emailed++;
        } catch {
          // Skip a single bad address without sinking the whole broadcast.
        }
      }
    }

    const finalised = await this.prisma.broadcast.update({
      where: { id },
      data: { stats: { recipients: recipients.length, delivered, emailed } as any },
    });

    // Phase 9.2: notify integrators (e.g. for archive-of-record systems).
    this.webhooks.emit(finalised.organizationId, 'broadcast.sent', {
      broadcastId: finalised.id,
      subject: finalised.subject,
      channels: finalised.channels,
      sentAt: finalised.sentAt?.toISOString(),
      stats: finalised.stats,
    });
    return finalised;
  }

  /**
   * Active residents (owners + tenants) of an org with a registered, active
   * user account — the audience for broadcasts. Returns contact details for
   * both the in-app notification fan-out and email dispatch.
   */
  private async residentRecipients(
    organizationId: string,
  ): Promise<Array<{ userId: string; email: string | null; firstName: string; lastName: string }>> {
    const occ = await this.prisma.unitOccupancy.findMany({
      where: {
        isActive: true,
        unit: { estate: { organizationId } },
        person: { userId: { not: null } },
      },
      select: { person: { select: { userId: true } } },
    });
    const userIds = Array.from(
      new Set(occ.map((o) => o.person?.userId).filter((x): x is string => !!x)),
    );
    if (userIds.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    return users.map((u) => ({
      userId: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
    }));
  }
}
