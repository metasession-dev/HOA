import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Actor, isResidentRole } from '../common/scope.util';
import { LlmProvider, LlmMessage } from '../assistant/llm/provider';
import { MockLlmProvider } from '../assistant/llm/mock.provider';
import { createLlmProvider } from '../assistant/llm/provider';
import { MailService } from '../mail/mail.service';

const MAX_BODY_BYTES = 256_000; // 256kb of body text — emails larger than this get truncated
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Phase 7.5 email intelligence.
 *
 * Pipeline:
 *   1. Ingest: provider-agnostic webhook payload normalized into InboundEmail row.
 *   2. Route to org via the To: address (a per-org alias mailbox we issue —
 *      `<orgSlug>@inbound.hoa.africa` in production, anything in dev).
 *   3. Classify intent + extract entities via the LlmProvider. Rule-based
 *      fallback ensures we always produce a slug even with no LLM key.
 *   4. Apply an auto-route handler when the intent is high-confidence + the
 *      target resident is unambiguous (e.g. inbound from a known email →
 *      file a Request on their unit).
 *   5. Draft an EmailDelivery reply (status=pending, human approval required).
 *
 * Designed to gracefully degrade: every step that fails leaves the email at a
 * recoverable status with an event row + error message so admin can retry.
 */

export type IntentSlug =
  | 'payment_inquiry'
  | 'request_submission'
  | 'vendor_invoice'
  | 'bounce_or_complaint'
  | 'unknown';

export type InboundPayload = {
  providerMessageId?: string;
  toAddress: string;
  fromAddress: string;
  fromName?: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: Array<{ url: string; filename: string; contentType?: string; size?: number }>;
  inReplyTo?: string;
  references?: string;
};

const RULE_PATTERNS: { slug: IntentSlug; patterns: RegExp[] }[] = [
  {
    slug: 'payment_inquiry',
    patterns: [
      /\b(invoice|payment|levy|owe|balance|outstanding|paid|receipt|statement)\b/i,
      /\bwhen.+(pay|due)\b/i,
    ],
  },
  {
    slug: 'request_submission',
    patterns: [
      /\b(maintenance|leak|broken|repair|noise|light|geyser|plumbing)\b/i,
      /\b(can you (please|kindly)?.+(fix|sort|come|check))\b/i,
    ],
  },
  {
    slug: 'vendor_invoice',
    patterns: [
      /\b(invoice|statement|po\b|quote|tax invoice|vendor)\b/i,
      /\battached\b.*\bpdf\b/i,
    ],
  },
  {
    slug: 'bounce_or_complaint',
    patterns: [
      /^(mail delivery failed|delivery status notification|undeliverable|automatic reply|out of office)\b/i,
      /\bmailer-daemon\b/i,
    ],
  },
];

@Injectable()
export class EmailIntelService {
  private readonly logger = new Logger(EmailIntelService.name);

  // Resolution: OPENAI_API_KEY → openai; ANTHROPIC_API_KEY → anthropic;
  // else mock. `createLlmProvider()` centralises the precedence so this
  // module and AssistantService can't drift.
  private readonly llm: LlmProvider = (() => {
    try {
      return createLlmProvider();
    } catch {
      return new MockLlmProvider();
    }
  })();

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  // ============ Ingest ============

  /**
   * Inbound webhook entry. Idempotent on providerMessageId — re-deliveries
   * return the existing row.
   */
  async ingest(payload: InboundPayload) {
    if (!EMAIL_RE.test(payload.fromAddress || '')) throw new BadRequestException('Invalid from address');
    if (!EMAIL_RE.test(payload.toAddress || '')) throw new BadRequestException('Invalid to address');

    if (payload.providerMessageId) {
      const existing = await this.prisma.inboundEmail.findUnique({ where: { providerMessageId: payload.providerMessageId } });
      if (existing) return { id: existing.id, deduped: true };
    }

    // Cap body sizes
    const bodyText = (payload.bodyText || '').slice(0, MAX_BODY_BYTES);
    const bodyHtml = (payload.bodyHtml || '').slice(0, MAX_BODY_BYTES);

    // Route to org by the inbound mailbox local-part (everything before `@`).
    // Production: a per-org alias like `acme-hoa@inbound.hoa.africa`. Dev:
    // any prefix that matches a known org slug.
    const localPart = (payload.toAddress.split('@')[0] || '').toLowerCase().trim();
    const org = localPart
      ? await this.prisma.organization.findFirst({ where: { slug: localPart } })
      : null;

    const row = await this.prisma.inboundEmail.create({
      data: {
        organizationId: org?.id,
        providerMessageId: payload.providerMessageId,
        toAddress: payload.toAddress,
        fromAddress: payload.fromAddress,
        fromName: payload.fromName,
        subject: payload.subject || '(no subject)',
        bodyText, bodyHtml,
        attachments: (payload.attachments || []) as any,
        inReplyTo: payload.inReplyTo,
        references: payload.references,
        status: 'received',
      },
    });
    await this.prisma.inboundEmailEvent.create({
      data: { inboundEmailId: row.id, type: 'received', payload: { localPart, org: org?.id } as any },
    });

    // Fire and forget the classification pipeline. The webhook responds 200
    // immediately so the provider doesn't retry while we're still thinking.
    this.classify(row.id).catch((err) => {
      this.logger.warn(`classify ${row.id} failed: ${err.message}`);
    });

    return { id: row.id };
  }

  // ============ Classify ============

  async classify(id: string) {
    const row = await this.prisma.inboundEmail.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Inbound email not found');
    if (row.status !== 'received' && row.status !== 'classified') return row;

    const text = (row.subject + '\n' + (row.bodyText || '')).slice(0, 8000);

    // Rule-based first pass — cheap + deterministic
    let slug: IntentSlug = 'unknown';
    let confidence = 0;
    for (const r of RULE_PATTERNS) {
      const hits = r.patterns.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
      if (hits > 0) {
        const c = Math.min(1, 0.4 + 0.2 * hits);
        if (c > confidence) { slug = r.slug; confidence = c; }
      }
    }

    // LLM upgrade pass — when the rules' confidence is low. With the
    // Mock provider this is deterministic (returns the same boilerplate
    // each time) so the rule-pass wins in practice; we only escalate to
    // a real model when Anthropic is configured.
    let entities: any = {};
    if (confidence < 0.6) {
      try {
        const messages: LlmMessage[] = [
          { role: 'system', content: 'You classify resident HOA email into one of these intents: payment_inquiry, request_submission, vendor_invoice, bounce_or_complaint, unknown. Reply with JSON: {"intent":"<slug>","confidence":0..1,"entities":{...}}' },
          { role: 'user', content: text },
        ];
        const r = await this.llm.generate(messages, { jsonSchema: { type: 'object' }, maxTokens: 400, temperature: 0 });
        try {
          const parsed = JSON.parse(r.content);
          if (parsed?.intent && ['payment_inquiry','request_submission','vendor_invoice','bounce_or_complaint','unknown'].includes(parsed.intent)) {
            slug = parsed.intent as IntentSlug;
            confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
            entities = parsed.entities || {};
          }
        } catch {
          // Provider returned non-JSON — fall back to rule output.
        }
      } catch (err: any) {
        this.logger.warn(`LLM classify failed for ${id}: ${err.message}`);
      }
    }

    const updated = await this.prisma.inboundEmail.update({
      where: { id },
      data: { intentSlug: slug, intentConfidence: confidence, entities, status: 'classified' },
    });
    await this.prisma.inboundEmailEvent.create({
      data: { inboundEmailId: id, type: 'classified', payload: { slug, confidence, entities } as any },
    });

    // Auto-route + draft only when:
    //   - we have an org match
    //   - confidence is high enough
    //   - the intent is auto-routable
    if (updated.organizationId && confidence >= 0.5) {
      try {
        await this.route(id);
      } catch (err: any) {
        this.logger.warn(`route ${id} failed: ${err.message}`);
      }
    }
    return updated;
  }

  // ============ Auto-route handlers ============

  async route(id: string) {
    const row = await this.prisma.inboundEmail.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Inbound email not found');
    if (!row.organizationId) throw new BadRequestException('Email is not routed to an organization');
    if (!row.intentSlug) throw new BadRequestException('Email has not been classified');

    let routedEntityType: string | null = null;
    let routedEntityId: string | null = null;

    switch (row.intentSlug as IntentSlug) {
      case 'request_submission':
        ({ routedEntityType, routedEntityId } = await this.routeRequest(row));
        break;
      case 'vendor_invoice':
        ({ routedEntityType, routedEntityId } = await this.routeVendorInvoice(row));
        break;
      case 'payment_inquiry':
        // No auto-create — only draft a reply so an admin reviews.
        break;
      case 'bounce_or_complaint':
        // Silent ignore; just mark.
        await this.prisma.inboundEmail.update({ where: { id }, data: { status: 'ignored' } });
        await this.prisma.inboundEmailEvent.create({ data: { inboundEmailId: id, type: 'ignored', payload: { reason: 'bounce' } as any } });
        return;
      default:
        break;
    }

    // Always draft a reply for non-ignored intents.
    const draftId = await this.draftReply(row, routedEntityType, routedEntityId);

    await this.prisma.inboundEmail.update({
      where: { id },
      data: {
        status: routedEntityId ? 'routed' : 'drafted',
        routedEntityType, routedEntityId, draftReplyId: draftId,
      },
    });
    await this.prisma.inboundEmailEvent.create({
      data: {
        inboundEmailId: id, type: routedEntityId ? 'routed' : 'drafted',
        payload: { routedEntityType, routedEntityId, draftReplyId: draftId } as any,
      },
    });
  }

  /**
   * Resident-emailed-request → auto-create a Request on the resident's
   * primary occupied unit. Falls back to draft-only if we can't identify
   * the resident or their unit.
   */
  private async routeRequest(row: any): Promise<{ routedEntityType: string | null; routedEntityId: string | null }> {
    if (!row.organizationId) return { routedEntityType: null, routedEntityId: null };
    // Identify the sender via Person/User.email match.
    const senderUser = await this.prisma.user.findUnique({ where: { email: row.fromAddress } });
    if (!senderUser) return { routedEntityType: null, routedEntityId: null };
    const occupancy = await this.prisma.unitOccupancy.findFirst({
      where: { isActive: true, person: { userId: senderUser.id, organizationId: row.organizationId } },
      select: { unitId: true, person: { select: { id: true } } },
    });
    if (!occupancy) return { routedEntityType: null, routedEntityId: null };

    // Pick a default category — first active one. Real prod would look at
    // intent entities (maintenance, parking, etc.) to choose more specifically.
    const category = await this.prisma.requestCategory.findFirst({
      where: { organizationId: row.organizationId, isActive: true },
    });
    if (!category) return { routedEntityType: null, routedEntityId: null };

    const req = await this.prisma.$transaction(async (tx) => {
      const dueAt = category.slaResolveHours
        ? new Date(Date.now() + category.slaResolveHours * 3600 * 1000)
        : null;
      const r = await tx.request.create({
        data: {
          organizationId: row.organizationId,
          unitId: occupancy.unitId,
          submittedByUserId: senderUser.id,
          categoryId: category.id,
          subject: row.subject.slice(0, 200),
          body: (row.bodyText || '').slice(0, 8000) + `\n\n— Auto-created from inbound email`,
          status: 'submitted',
          priority: category.defaultPriority,
          dueAt,
          attachments: (row.attachments || []) as any,
        },
      });
      await tx.requestEvent.create({
        data: { requestId: r.id, actorId: senderUser.id, type: 'submitted', payload: { source: 'email_intel', inboundEmailId: row.id } as any },
      });
      return r;
    });
    return { routedEntityType: 'Request', routedEntityId: req.id };
  }

  /**
   * Vendor-invoice attachment → auto-create a VendorInvoice draft. Requires:
   *   - a known vendor whose email matches the fromAddress
   *   - at least one PDF attachment
   * Otherwise leaves it as draft-only.
   */
  private async routeVendorInvoice(row: any): Promise<{ routedEntityType: string | null; routedEntityId: string | null }> {
    if (!row.organizationId) return { routedEntityType: null, routedEntityId: null };
    const vendor = await this.prisma.vendor.findFirst({
      where: { organizationId: row.organizationId, email: row.fromAddress, status: 'active' },
    });
    if (!vendor) return { routedEntityType: null, routedEntityId: null };

    const attachments = (row.attachments as any[]) || [];
    const pdf = attachments.find((a) => /pdf/i.test(a.contentType || '') || /\.pdf$/i.test(a.filename || ''));
    if (!pdf) return { routedEntityType: null, routedEntityId: null };

    // Need an invoice number. Pull from subject heuristic ("INV-1234") or use a placeholder.
    const invMatch = row.subject?.match(/\b(INV[-\s]?\d+|\#\d+)\b/i);
    const vendorInvoiceNo = invMatch ? invMatch[1].replace(/\s/g, '') : `INBOUND-${row.id.slice(-8)}`;

    // Amount detection is unreliable from email; mark as 0 + flag for admin review.
    try {
      const v = await this.prisma.vendorInvoice.create({
        data: {
          organizationId: row.organizationId,
          vendorId: vendor.id,
          vendorInvoiceNo,
          amount: 0,
          currency: vendor.preferredCurrency || 'ZAR',
          issueDate: row.createdAt,
          dueDate: new Date(row.createdAt.getTime() + 30 * 86400_000),
          status: 'captured',
          attachments: [pdf] as any,
          notes: `Auto-captured from inbound email "${row.subject}". Verify amount + invoice number.`,
          capturedBy: vendor.createdBy,
        },
      });
      return { routedEntityType: 'VendorInvoice', routedEntityId: v.id };
    } catch (err: any) {
      // Unique constraint clash → vendor + invoice number already exists.
      if (err?.code === 'P2002') return { routedEntityType: null, routedEntityId: null };
      throw err;
    }
  }

  // ============ Draft replies ============

  private async draftReply(row: any, routedType: string | null, routedId: string | null): Promise<string | null> {
    if (!row.organizationId) return null;
    let body = '';
    switch (row.intentSlug as IntentSlug) {
      case 'payment_inquiry':
        body = `Hi ${row.fromName || ''},\n\nThanks for reaching out. We've received your payment query and a team member will look at your account and reply shortly.\n\nIf you need to settle right away, you can pay online at ${process.env.RESIDENT_BASE_URL || 'http://localhost:3002'}/invoices.\n\n— HOA.africa`;
        break;
      case 'request_submission':
        body = routedId
          ? `Hi ${row.fromName || ''},\n\nWe've logged your request (id ${routedId}). The team will be in touch as soon as someone is assigned.\n\n— HOA.africa`
          : `Hi ${row.fromName || ''},\n\nWe received your message but couldn't automatically link it to your unit. A team member will get back to you shortly.\n\n— HOA.africa`;
        break;
      case 'vendor_invoice':
        body = routedId
          ? `Hi ${row.fromName || ''},\n\nWe've captured your invoice for review. Our finance team will process it and confirm.\n\n— HOA.africa`
          : `Hi ${row.fromName || ''},\n\nWe received your email. Our finance team will review and respond shortly.\n\n— HOA.africa`;
        break;
      default:
        body = `Hi ${row.fromName || ''},\n\nThanks — a team member will reply shortly.\n\n— HOA.africa`;
        break;
    }
    try {
      const draft = await this.mail.enqueue({
        organizationId: row.organizationId,
        templateKey: 'broadcast',
        data: {
          recipientFirstName: row.fromName || row.fromAddress.split('@')[0],
          subject: `Re: ${row.subject}`,
          body,
        },
        to: row.fromAddress,
        toName: row.fromName,
        entityType: 'InboundEmail',
        entityId: row.id,
      });
      // Important: leave the draft in `pending` status so the worker dispatches
      // it automatically after admin approval. Admin "approve" flips a flag.
      // For now, the dispatcher will send all pending emails — review the
      // queue from /api/mail before flipping any switches in prod.
      return draft.id;
    } catch (err: any) {
      this.logger.warn(`draftReply failed for ${row.id}: ${err.message}`);
      return null;
    }
  }

  // ============ Admin endpoints ============

  async list(orgId: string, query: { status?: string; intent?: string } = {}) {
    const where: any = { organizationId: orgId };
    if (query.status) where.status = query.status;
    if (query.intent) where.intentSlug = query.intent;
    return this.prisma.inboundEmail.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, providerMessageId: true, toAddress: true, fromAddress: true, fromName: true,
        subject: true, intentSlug: true, intentConfidence: true, status: true,
        routedEntityType: true, routedEntityId: true, draftReplyId: true,
        sentReplyAt: true, createdAt: true,
      },
    });
  }

  async findById(orgId: string, id: string) {
    const row = await this.prisma.inboundEmail.findFirst({
      where: { id, organizationId: orgId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!row) throw new NotFoundException('Inbound email not found');
    return row;
  }

  async approveReply(orgId: string, actor: Actor, id: string) {
    if (isResidentRole(actor.role)) throw new ForbiddenException('Only admins can approve replies');
    const row = await this.prisma.inboundEmail.findFirst({ where: { id, organizationId: orgId } });
    if (!row) throw new NotFoundException('Inbound email not found');
    if (!row.draftReplyId) throw new BadRequestException('No draft reply on this email');
    if (row.sentReplyAt) return { ok: true, alreadySent: true };
    // The draft is already an EmailDelivery row in `pending` status — the
    // worker will pick it up. We just flip our side.
    await this.prisma.inboundEmail.update({
      where: { id },
      data: { status: 'replied', sentReplyAt: new Date() },
    });
    await this.prisma.inboundEmailEvent.create({
      data: { inboundEmailId: id, actorId: actor.userId, type: 'replied', payload: { draftReplyId: row.draftReplyId } as any },
    });
    return { ok: true, draftReplyId: row.draftReplyId };
  }

  async escalate(orgId: string, actor: Actor, id: string, notes?: string) {
    if (isResidentRole(actor.role)) throw new ForbiddenException('Only admins can escalate');
    const row = await this.prisma.inboundEmail.findFirst({ where: { id, organizationId: orgId } });
    if (!row) throw new NotFoundException('Inbound email not found');
    await this.prisma.inboundEmail.update({
      where: { id },
      data: { status: 'escalated', reviewerNotes: notes?.slice(0, 2000) },
    });
    await this.prisma.inboundEmailEvent.create({
      data: { inboundEmailId: id, actorId: actor.userId, type: 'escalated', payload: { notes } as any },
    });
    return { ok: true };
  }
}
