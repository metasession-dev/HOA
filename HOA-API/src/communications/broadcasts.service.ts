import {
  Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, Logger,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { Actor, isResidentRole } from '../common/scope.util';
import { MailService } from '../mail/mail.service';

export type Segment = {
  allOwners?: boolean;
  paidUpOnly?: boolean;
  debtorMinAmount?: number;
  estateIds?: string[];
  unitTagIn?: string[];
  roleIn?: string[];
  personIds?: string[];
  residenceStatusIn?: string[]; // owner | tenant
};

const MERGE_FIELDS = ['firstName', 'lastName', 'email', 'unitNumber', 'estateName', 'outstandingAmount', 'currency'];
const SUBSTITUTE_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;
const ALLOWED_CHANNELS = ['email'] as const; // SMS lands in Phase 2.3
const MAX_RECIPIENTS_PER_BROADCAST = 5000;

/**
 * Phase 2.5 Mass Broadcast 2.0.
 *
 * Lifecycle:
 *   draft → scheduled → sending → sent | cancelled | failed
 *
 * The "send" flow:
 *   1. resolveSegment(orgId, segment) → list of resident contact rows.
 *   2. For each contact, render subject + body with merge-field substitution.
 *   3. Check opt-out (org, email, topic). If opted out → skip + count.
 *   4. Persist a BroadcastDelivery row.
 *   5. Enqueue a transactional email via MailService (channel=email).
 *
 * Aggregated counters update as deliveries land. The admin sees % of resolved
 * recipients reached.
 */
@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger(BroadcastsService.name);

  constructor(private prisma: PrismaService, private mail: MailService) {}

  async list(orgId: string) {
    return this.prisma.broadcast.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, subject: true, channels: true, status: true,
        scheduledAt: true, sentAt: true, createdBy: true, createdAt: true,
        resolvedRecipients: true, successCount: true, failureCount: true, optOutCount: true,
        optOutTopic: true,
      },
    });
  }

  async findById(orgId: string, id: string) {
    const row = await this.prisma.broadcast.findFirst({
      where: { id, organizationId: orgId },
      include: { _count: { select: { deliveries: true } } },
    });
    if (!row) throw new NotFoundException('Broadcast not found');
    return row;
  }

  async create(
    orgId: string,
    actor: Actor,
    dto: { subject: string; body: string; channels?: string[]; targetSegment?: Segment; scheduledAt?: string; optOutTopic?: string },
  ) {
    if (isResidentRole(actor.role)) throw new ForbiddenException('Only admins can create broadcasts');
    this.validate(dto);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.broadcast.create({
        data: {
          organizationId: orgId,
          subject: dto.subject,
          body: dto.body,
          channels: dto.channels || ['email'],
          targetSegment: (dto.targetSegment || {}) as any,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          optOutTopic: dto.optOutTopic,
          createdBy: actor.userId,
          status: 'draft',
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId, actorId: actor.userId, actorRole: actor.role,
          action: 'broadcast_created', entityType: 'Broadcast', entityId: row.id,
          changes: { subject: row.subject, channels: row.channels, segment: dto.targetSegment } as any,
        },
      });
      return row;
    });
  }

  async update(orgId: string, actor: Actor, id: string, dto: Partial<{ subject: string; body: string; channels: string[]; targetSegment: Segment; scheduledAt: string; optOutTopic: string }>) {
    if (isResidentRole(actor.role)) throw new ForbiddenException('Only admins can edit broadcasts');
    const existing = await this.prisma.broadcast.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundException('Broadcast not found');
    if (!['draft', 'scheduled'].includes(existing.status)) {
      throw new ConflictException(`Cannot edit a ${existing.status} broadcast`);
    }
    if (dto.subject || dto.body || dto.channels) this.validate({ subject: dto.subject || existing.subject, body: dto.body || existing.body, channels: dto.channels });
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.broadcast.update({
        where: { id },
        data: {
          subject: dto.subject,
          body: dto.body,
          channels: dto.channels,
          targetSegment: dto.targetSegment as any,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          optOutTopic: dto.optOutTopic,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId, actorId: actor.userId, actorRole: actor.role,
          action: 'broadcast_updated', entityType: 'Broadcast', entityId: id,
          changes: { before: { subject: existing.subject, channels: existing.channels }, after: { subject: updated.subject, channels: updated.channels } } as any,
        },
      });
      return updated;
    });
  }

  /** Schedule a draft to send at `scheduledAt`, or immediately if missing. */
  async schedule(orgId: string, actor: Actor, id: string, scheduledAt?: string) {
    if (isResidentRole(actor.role)) throw new ForbiddenException('Only admins can schedule broadcasts');
    const existing = await this.prisma.broadcast.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundException('Broadcast not found');
    if (existing.status !== 'draft') throw new ConflictException(`Cannot schedule a ${existing.status} broadcast`);
    const when = scheduledAt ? new Date(scheduledAt) : new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.broadcast.update({
        where: { id },
        data: { status: 'scheduled', scheduledAt: when },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId, actorId: actor.userId, actorRole: actor.role,
          action: 'broadcast_scheduled', entityType: 'Broadcast', entityId: id,
          changes: { scheduledAt: when } as any,
        },
      });
      return updated;
    });
  }

  async cancel(orgId: string, actor: Actor, id: string) {
    if (isResidentRole(actor.role)) throw new ForbiddenException('Only admins can cancel broadcasts');
    return this.prisma.$transaction(async (tx) => {
      const cas = await tx.broadcast.updateMany({
        where: { id, organizationId: orgId, status: { in: ['draft', 'scheduled'] } },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
      if (cas.count === 0) throw new ConflictException('Broadcast cannot be cancelled (already sending or sent)');
      await tx.auditLog.create({
        data: {
          organizationId: orgId, actorId: actor.userId, actorRole: actor.role,
          action: 'broadcast_cancelled', entityType: 'Broadcast', entityId: id,
          changes: {} as any,
        },
      });
      return tx.broadcast.findUniqueOrThrow({ where: { id } });
    });
  }

  /**
   * Dry-run: resolve the segment and return a sample + total count without
   * persisting any deliveries.
   */
  async preview(orgId: string, id: string, sampleSize = 20) {
    const b = await this.findById(orgId, id);
    const recipients = await this.resolveSegment(orgId, b.targetSegment as Segment);
    const sample = recipients.slice(0, Math.max(1, Math.min(sampleSize, 100))).map((r) => ({
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      unitNumber: r.unitNumber,
      estateName: r.estateName,
      outstandingAmount: r.outstandingAmount,
    }));
    // Render the merge fields for the first row so the admin sees what residents will get.
    const firstRendered = recipients[0] ? this.render(b.subject, b.body, recipients[0], b.organizationId) : null;
    return {
      totalRecipients: recipients.length,
      sample,
      rendered: firstRendered,
    };
  }

  /**
   * Worker entrypoint. Fan-out the broadcast: resolve recipients, render,
   * dedup against existing BroadcastDelivery rows, enqueue emails via
   * MailService. Idempotent — re-running picks up where it left off.
   */
  async sendNow(orgId: string, actor: Actor, id: string) {
    const b = await this.prisma.broadcast.findFirst({ where: { id, organizationId: orgId } });
    if (!b) throw new NotFoundException('Broadcast not found');
    if (!['draft', 'scheduled', 'sending'].includes(b.status)) {
      throw new ConflictException(`Cannot send a ${b.status} broadcast`);
    }

    // CAS into `sending` so concurrent invocations don't double-fan-out.
    if (b.status !== 'sending') {
      const cas = await this.prisma.broadcast.updateMany({
        where: { id, status: b.status },
        data: { status: 'sending' },
      });
      if (cas.count === 0) {
        throw new ConflictException('Broadcast was modified concurrently');
      }
    }

    try {
      const recipients = await this.resolveSegment(orgId, b.targetSegment as Segment);
      if (recipients.length > MAX_RECIPIENTS_PER_BROADCAST) {
        throw new BadRequestException(`Recipient count ${recipients.length} exceeds ${MAX_RECIPIENTS_PER_BROADCAST}`);
      }
      await this.prisma.broadcast.update({
        where: { id }, data: { resolvedRecipients: recipients.length },
      });

      // Bulk-load opt-outs for this org+topic to avoid N+1 queries.
      const optOuts = await this.prisma.broadcastOptOut.findMany({
        where: {
          organizationId: orgId,
          OR: [{ topic: b.optOutTopic ?? null }, { topic: null }], // global opt-out kills topic-scoped too
        },
        select: { email: true, topic: true },
      });
      const optedOutEmails = new Set(optOuts.map((o) => o.email.toLowerCase()));

      let success = 0; let optOutN = 0; let failure = 0;

      for (const r of recipients) {
        if (!r.email) { failure++; continue; }
        if (optedOutEmails.has(r.email.toLowerCase())) {
          // Persist the opted-out row so the campaign log shows what we skipped.
          await this.prisma.broadcastDelivery.upsert({
            where: { broadcastId_recipientEmail: { broadcastId: id, recipientEmail: r.email } },
            create: {
              broadcastId: id, organizationId: orgId,
              recipientEmail: r.email, recipientUserId: r.userId, recipientPersonId: r.personId,
              renderedSubject: '', renderedBody: '',
              status: 'opted_out', optOutTopic: b.optOutTopic,
            },
            update: { status: 'opted_out' },
          });
          optOutN++;
          continue;
        }

        const { subject, body } = this.render(b.subject, b.body, r, orgId);

        // Already-sent? skip.
        const existing = await this.prisma.broadcastDelivery.findUnique({
          where: { broadcastId_recipientEmail: { broadcastId: id, recipientEmail: r.email } },
        });
        if (existing && existing.status === 'sent') { success++; continue; }

        try {
          // Use the existing EmailDelivery pipeline so retries + open/click
          // tracking + audit log all carry through automatically. The opt-out
          // URL embeds a stateless HMAC token so we don't have to pre-issue
          // rows (which would conflict with "is opted out" semantics).
          const stateless = this.issueStatelessOptOutToken(orgId, r.email, b.optOutTopic ?? null);
          const optOutUrl = `${process.env.RESIDENT_BASE_URL || 'http://localhost:3002'}/unsubscribe?token=${stateless}`;

          const mailRow = await this.mail.enqueue({
            organizationId: orgId,
            templateKey: 'broadcast',
            data: {
              recipientFirstName: r.firstName,
              subject,
              body,
              optOutUrl,
            },
            to: r.email,
            toName: `${r.firstName} ${r.lastName}`,
            toUserId: r.userId,
            entityType: 'Broadcast',
            entityId: id,
          }, { force: true });

          await this.prisma.broadcastDelivery.upsert({
            where: { broadcastId_recipientEmail: { broadcastId: id, recipientEmail: r.email } },
            create: {
              broadcastId: id, organizationId: orgId,
              recipientEmail: r.email, recipientUserId: r.userId, recipientPersonId: r.personId,
              renderedSubject: subject, renderedBody: body,
              status: 'sent', channelUsed: 'email', emailDeliveryId: mailRow.id, sentAt: new Date(),
            },
            update: {
              renderedSubject: subject, renderedBody: body,
              status: 'sent', channelUsed: 'email', emailDeliveryId: mailRow.id, sentAt: new Date(),
            },
          });
          success++;
        } catch (err: any) {
          await this.prisma.broadcastDelivery.upsert({
            where: { broadcastId_recipientEmail: { broadcastId: id, recipientEmail: r.email } },
            create: {
              broadcastId: id, organizationId: orgId,
              recipientEmail: r.email, recipientUserId: r.userId, recipientPersonId: r.personId,
              renderedSubject: subject, renderedBody: body,
              status: 'failed', failureReason: err?.message?.slice(0, 500),
            },
            update: { status: 'failed', failureReason: err?.message?.slice(0, 500) },
          });
          failure++;
        }
      }

      await this.prisma.broadcast.update({
        where: { id },
        data: {
          status: 'sent', sentAt: new Date(),
          successCount: success, failureCount: failure, optOutCount: optOutN,
          stats: { resolved: recipients.length, success, failure, optOut: optOutN } as any,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          organizationId: orgId, actorId: actor.userId, actorRole: actor.role,
          action: 'broadcast_sent', entityType: 'Broadcast', entityId: id,
          changes: { resolved: recipients.length, success, failure, optOut: optOutN } as any,
        },
      });

      return { ok: true, resolved: recipients.length, success, failure, optOut: optOutN };
    } catch (err: any) {
      await this.prisma.broadcast.update({
        where: { id }, data: { status: 'failed' },
      }).catch(() => {});
      throw err;
    }
  }

  /** Cron entrypoint: send any `scheduled` broadcasts whose scheduledAt has passed. */
  async sendDueBroadcasts(orgId: string, actor: Actor) {
    const due = await this.prisma.broadcast.findMany({
      where: { organizationId: orgId, status: 'scheduled', scheduledAt: { lte: new Date() } },
      select: { id: true },
    });
    const results: any[] = [];
    for (const b of due) {
      try { results.push(await this.sendNow(orgId, actor, b.id)); }
      catch (err: any) {
        this.logger.warn(`broadcast ${b.id} failed: ${err.message}`);
        results.push({ broadcastId: b.id, error: err.message });
      }
    }
    return { processed: results.length, results };
  }

  // ============ Opt-out (stateless HMAC tokens) ============

  /**
   * Stateless opt-out token format: `<payload-b64url>.<sig-b64url>` where
   * `payload = "<orgId>|<email>|<topic>"`. The signature uses
   * `BROADCAST_OPTOUT_SECRET` (falls back to JWT_SECRET).
   *
   * Why stateless: pre-creating a `BroadcastOptOut` row to "reserve" a token
   * would conflict with the "is this recipient opted out?" check, which uses
   * the same table. Stateless tokens decouple "URL I emailed" from "row that
   * indicates opt-out".
   */
  private issueStatelessOptOutToken(orgId: string, email: string, topic: string | null): string {
    const payload = `${orgId}|${email}|${topic ?? ''}`;
    const secret = process.env.BROADCAST_OPTOUT_SECRET || process.env.JWT_SECRET || 'dev-secret-change-me';
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    return `${Buffer.from(payload, 'utf8').toString('base64url')}.${sig}`;
  }

  private verifyStatelessOptOutToken(token: string): { orgId: string; email: string; topic: string | null } {
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) throw new BadRequestException('Malformed opt-out token');
    const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const secret = process.env.BROADCAST_OPTOUT_SECRET || process.env.JWT_SECRET || 'dev-secret-change-me';
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    try {
      const a = Buffer.from(sig, 'base64url');
      const b = Buffer.from(expected, 'base64url');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        throw new BadRequestException('Invalid opt-out token');
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Invalid opt-out token');
    }
    const [orgId, email, topicRaw] = payload.split('|');
    if (!orgId || !email) throw new BadRequestException('Malformed opt-out payload');
    return { orgId, email, topic: topicRaw || null };
  }

  /**
   * Public endpoint handler — validate HMAC, persist the opt-out row.
   * Idempotent: a second hit on the same (org, email, topic) returns ok.
   */
  async recordOptOut(token: string, source: 'email_link' | 'admin' | 'complaint' = 'email_link') {
    const { orgId, email, topic } = this.verifyStatelessOptOutToken(token);
    const rowToken = crypto.randomBytes(24).toString('base64url');
    try {
      await this.prisma.broadcastOptOut.create({
        data: { organizationId: orgId, email, topic, token: rowToken, source },
      });
      return { ok: true, orgId, email, topic };
    } catch (err: any) {
      if (err?.code === 'P2002') return { ok: true, alreadyOptedOut: true, orgId, email, topic };
      throw err;
    }
  }

  // ============ Helpers ============

  private validate(dto: { subject: string; body: string; channels?: string[] }) {
    if (!dto.subject || dto.subject.length > 200) {
      throw new BadRequestException('subject is required (≤200 chars)');
    }
    if (!dto.body || dto.body.length > 20_000) {
      throw new BadRequestException('body is required (≤20,000 chars)');
    }
    for (const c of dto.channels || []) {
      if (!ALLOWED_CHANNELS.includes(c as any)) {
        throw new BadRequestException(`channel ${c} not supported in this phase`);
      }
    }
    // Reject unknown merge fields up-front so admins get a quick error.
    for (const txt of [dto.subject, dto.body]) {
      for (const m of [...txt.matchAll(SUBSTITUTE_RE)]) {
        const f = m[1];
        if (!MERGE_FIELDS.includes(f)) {
          throw new BadRequestException(`Unknown merge field: {{${f}}}. Allowed: ${MERGE_FIELDS.join(', ')}`);
        }
      }
    }
  }

  /**
   * Resolve a segment to a list of resident contacts. Only residents tied to
   * a registered user (i.e., we have an email) are returned.
   */
  private async resolveSegment(orgId: string, segment: Segment) {
    // Strategy: walk active occupancies → person + user + unit + estate.
    // Apply filters in-memory after the query since segment shape is small.
    const filter: any = { isActive: true };
    const unitFilter: any = { estate: { organizationId: orgId } };
    if (segment.estateIds?.length) unitFilter.estateId = { in: segment.estateIds };
    if (segment.unitTagIn?.length) unitFilter.tags = { hasSome: segment.unitTagIn };
    filter.unit = unitFilter;
    if (segment.residenceStatusIn?.length) filter.role = { in: segment.residenceStatusIn };
    if (segment.personIds?.length) filter.personId = { in: segment.personIds };

    const occs: any[] = await this.prisma.unitOccupancy.findMany({
      where: filter,
      include: {
        person: true,
        unit: { include: { estate: { select: { id: true, name: true } } } },
      },
      take: MAX_RECIPIENTS_PER_BROADCAST + 1,
    });

    // Org currency once (Estate has no currency field — we use the org's).
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { currency: true },
    });
    const orgCurrency = org?.currency || 'ZAR';

    const out: any[] = [];
    for (const o of occs) {
      if (!o.person?.userId) continue;
      const user = await this.prisma.user.findUnique({
        where: { id: o.person.userId },
        select: { id: true, email: true, firstName: true, lastName: true, isActive: true },
      });
      if (!user?.email || !user.isActive) continue;

      // Outstanding-amount based filters
      let outstanding = 0;
      if (segment.paidUpOnly || (segment.debtorMinAmount && segment.debtorMinAmount > 0)) {
        const unpaid = await this.prisma.invoice.findMany({
          where: {
            unitId: o.unitId, organizationId: orgId,
            status: { in: ['sent', 'partial', 'overdue'] },
          },
          select: { amount: true, payments: { select: { amount: true, status: true } } },
        });
        outstanding = unpaid.reduce((s: number, inv: any) => {
          const paid = inv.payments.filter((p: any) => p.status === 'completed')
            .reduce((ss: number, p: any) => ss + Number(p.amount.toString()), 0);
          return s + Math.max(0, Number(inv.amount.toString()) - paid);
        }, 0);
        if (segment.paidUpOnly && outstanding > 0) continue;
        if (segment.debtorMinAmount && outstanding < segment.debtorMinAmount) continue;
      }

      out.push({
        userId: user.id,
        personId: o.personId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        unitNumber: o.unit?.unitNumber,
        estateName: o.unit?.estate?.name,
        outstandingAmount: outstanding,
        currency: orgCurrency,
      });
    }
    return out;
  }

  /**
   * Apply merge-field substitution to subject + body. Unknown fields are
   * stripped (already validated at create-time).
   */
  private render(subject: string, body: string, r: any, orgId: string) {
    const ctx = {
      firstName: r.firstName || '',
      lastName: r.lastName || '',
      email: r.email || '',
      unitNumber: r.unitNumber || '',
      estateName: r.estateName || '',
      outstandingAmount: r.outstandingAmount != null ? `${r.outstandingAmount} ${r.currency || 'ZAR'}` : '',
      currency: r.currency || 'ZAR',
    };
    const sub = (s: string) => s.replace(SUBSTITUTE_RE, (_m, k) => (ctx as any)[k] ?? '');
    return { subject: sub(subject), body: sub(body) };
  }
}
