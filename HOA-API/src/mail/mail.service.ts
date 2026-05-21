import { Injectable, Logger, Optional, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma.service';
import { renderTemplate, TemplateKey } from './templates/registry';
import { ResendProvider } from './resend.provider';
import { QUEUE_NAMES } from '../jobs/queue-names';

const MAX_HTML_BYTES = 1_000_000; // 1MB cap on stored HTML

export type EnqueueEmailInput = {
  organizationId?: string;
  templateKey: TemplateKey;
  data: any;
  to: string;
  toName?: string;
  toUserId?: string;
  // Used for dedup — same (org, template, entity, recipient) tuple won't double-send.
  entityType?: string;
  entityId?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
};

/**
 * Phase 2.2 transactional mail.
 *
 * Public surface:
 *   - `enqueue()` — render the template + persist a `pending` EmailDelivery row.
 *     The `email-deliveries` queue (Phase 2.1) picks it up and dispatches.
 *   - `deliverPending()` — worker entrypoint; called by the processor.
 *   - `handleResendWebhook()` — inbound delivery / bounce / complaint events.
 *
 * Idempotency: the EmailDelivery unique index on
 * (organizationId, templateKey, entityType, entityId, recipientEmail)
 * means a duplicate enqueue is a no-op. Use `force=true` to bypass.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private prisma: PrismaService,
    private resend: ResendProvider,
    @Optional() @InjectQueue(QUEUE_NAMES.EMAIL_DELIVERIES) private emailQ?: Queue,
  ) {}

  /**
   * Render + enqueue. Fire-and-forget for callers — they get the row id back.
   * Per the dedup unique index, a repeat call returns the existing row.
   */
  async enqueue(input: EnqueueEmailInput, opts: { force?: boolean } = {}): Promise<{ id: string }> {
    if (!input.to || !/^[^@]+@[^@]+\.[^@]+$/.test(input.to)) {
      throw new BadRequestException('Invalid recipient email');
    }
    const render = await renderTemplate(input.templateKey, input.data as any);

    // Dedup on the unique index (returns the existing row if it already exists).
    const existing = await this.prisma.emailDelivery.findFirst({
      where: {
        organizationId: input.organizationId ?? null,
        templateKey: input.templateKey,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        recipientEmail: input.to,
      },
    });

    if (existing && !opts.force) {
      return { id: existing.id };
    }

    const html = render.html.length > MAX_HTML_BYTES
      ? render.html.slice(0, MAX_HTML_BYTES) + '\n<!-- truncated -->'
      : render.html;

    const row = existing && opts.force
      ? await this.prisma.emailDelivery.update({
          where: { id: existing.id },
          data: {
            subject: render.subject,
            html,
            templateData: input.data as any,
            status: 'pending',
            attempt: 0,
            failedAt: null,
            failureReason: null,
            nextAttemptAt: new Date(),
          },
        })
      : await this.prisma.emailDelivery.create({
          data: {
            organizationId: input.organizationId,
            templateKey: input.templateKey,
            recipientEmail: input.to,
            recipientName: input.toName,
            recipientUserId: input.toUserId,
            subject: render.subject,
            html,
            entityType: input.entityType,
            entityId: input.entityId,
            templateData: input.data as any,
            status: 'pending',
            nextAttemptAt: new Date(),
          },
        });

    // Best-effort enqueue. When the queue isn't available (JOBS_DISABLED=1),
    // the row stays pending and the next admin "Run now" sweeps it.
    if (this.emailQ) {
      try {
        await this.emailQ.add('send', { deliveryId: row.id }, { attempts: 1, removeOnComplete: 200, removeOnFail: 200 });
      } catch (err: any) {
        this.logger.warn(`Email queue enqueue failed (deliveryId=${row.id}): ${err.message}`);
      }
    }

    return { id: row.id };
  }

  /**
   * Worker entrypoint. Per `deliveryId`, take the row if still pending,
   * dispatch via the provider, persist sent/failed status. Designed to be
   * idempotent — concurrent workers CAS on the status.
   */
  async deliver(deliveryId: string): Promise<{ ok: boolean; reason?: string }> {
    const claim = await this.prisma.emailDelivery.updateMany({
      where: { id: deliveryId, status: 'pending' },
      data: { status: 'sending', attempt: { increment: 1 } },
    });
    if (claim.count === 0) return { ok: false, reason: 'not-pending' };

    const row = await this.prisma.emailDelivery.findUnique({ where: { id: deliveryId } });
    if (!row) return { ok: false, reason: 'gone' };

    const provider = this.resend.isConfigured() ? 'resend' : 'mock';

    try {
      let providerMessageId: string | null = null;
      if (provider === 'resend') {
        const r = await this.resend.send({
          to: row.recipientEmail,
          toName: row.recipientName || undefined,
          subject: row.subject,
          html: row.html,
        });
        providerMessageId = r.id;
      } else {
        // Mock: pretend it succeeded.
        providerMessageId = `mock-${Date.now()}`;
        this.logger.log(`[MOCK MAIL] to=${row.recipientEmail} subject=${row.subject}`);
      }
      await this.prisma.emailDelivery.update({
        where: { id: row.id },
        data: { status: 'sent', sentAt: new Date(), provider, providerMessageId },
      });
      return { ok: true };
    } catch (err: any) {
      // Retry logic — leave at pending if we have attempts left, else mark failed.
      const failed = (row.attempt + 1) >= row.maxAttempts;
      const backoffMin = [1, 5, 15, 60, 360][Math.min(row.attempt, 4)] || 360;
      await this.prisma.emailDelivery.update({
        where: { id: row.id },
        data: {
          status: failed ? 'failed' : 'pending',
          failureReason: err?.message?.slice(0, 500),
          failedAt: failed ? new Date() : null,
          nextAttemptAt: failed ? null : new Date(Date.now() + backoffMin * 60_000),
        },
      });
      return { ok: false, reason: err?.message };
    }
  }

  /** Cron entrypoint: drains pending+due deliveries. */
  async deliverPending(limit = 100) {
    const due = await this.prisma.emailDelivery.findMany({
      where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    let sent = 0; let failed = 0;
    for (const d of due) {
      const r = await this.deliver(d.id);
      if (r.ok) sent++;
      else failed++;
    }
    return { processed: due.length, sent, failed };
  }

  /**
   * Resend webhook handler. Fires delivered / opened / clicked / bounced
   * events. We update the matching delivery row by `providerMessageId`.
   * Signature verification happens in the controller.
   */
  async handleResendWebhook(payload: any) {
    const type = payload?.type;
    const id = payload?.data?.email_id;
    if (!id) return { ok: false, reason: 'no email_id' };
    const row = await this.prisma.emailDelivery.findFirst({ where: { providerMessageId: id } });
    if (!row) return { ok: true, ignored: true };
    const now = new Date();
    const data: any = {};
    switch (type) {
      case 'email.delivered': data.status = 'sent'; data.deliveredAt = now; break;
      case 'email.opened': data.openedAt = now; break;
      case 'email.clicked': data.clickedAt = now; break;
      case 'email.bounced': data.status = 'bounced'; data.failedAt = now; data.failureReason = (payload?.data?.bounce?.message || 'bounced').slice(0, 500); break;
      case 'email.complained': data.status = 'complained'; data.failedAt = now; data.failureReason = 'complaint'; break;
      default: return { ok: true, ignored: true };
    }
    await this.prisma.emailDelivery.update({ where: { id: row.id }, data });
    return { ok: true };
  }

  // ============ Admin observability ============

  async list(orgId: string, query: { status?: string; templateKey?: string; entityId?: string } = {}) {
    const where: any = { organizationId: orgId };
    if (query.status) where.status = query.status;
    if (query.templateKey) where.templateKey = query.templateKey;
    if (query.entityId) where.entityId = query.entityId;
    return this.prisma.emailDelivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, templateKey: true, recipientEmail: true, recipientName: true,
        subject: true, status: true, provider: true, attempt: true,
        sentAt: true, deliveredAt: true, openedAt: true, clickedAt: true,
        failedAt: true, failureReason: true, entityType: true, entityId: true,
        createdAt: true,
      },
    });
  }

  async findById(orgId: string, id: string) {
    const row = await this.prisma.emailDelivery.findFirst({ where: { id, organizationId: orgId } });
    if (!row) throw new NotFoundException('Email not found');
    return row;
  }

  async resendDelivery(orgId: string, id: string) {
    const row = await this.prisma.emailDelivery.findFirst({ where: { id, organizationId: orgId } });
    if (!row) throw new NotFoundException('Email not found');
    if (row.attempt >= row.maxAttempts) {
      // Bump the cap so a manual retry is allowed.
      await this.prisma.emailDelivery.update({ where: { id }, data: { maxAttempts: row.attempt + 3 } });
    }
    await this.prisma.emailDelivery.update({
      where: { id },
      data: { status: 'pending', nextAttemptAt: new Date(), failureReason: null, failedAt: null },
    });
    if (this.emailQ) {
      await this.emailQ.add('send', { deliveryId: id }, { attempts: 1 });
    }
    return { ok: true };
  }
}
