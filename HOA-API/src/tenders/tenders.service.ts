import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VotesService } from '../votes/votes.service';
import {
  CreateTenderDto,
  UpdateTenderDto,
  SubmitBidDto,
  ShortlistBidDto,
  StartExcoVoteDto,
  AwardBidDto,
  TenderAiDraftDto,
} from './dto/tenders.dto';
import { createLlmProvider } from '../assistant/llm/provider';

type Actor = { userId: string; role: string };

const RESIDENT_BASE = (
  process.env.APP_RESIDENTS_URL || process.env.RESIDENT_BASE_URL || 'http://localhost:3002'
).replace(/\/$/, '');
const ENTERPRISE_BASE = (
  process.env.APP_ENTERPRISE_URL || process.env.ENTERPRISE_BASE_URL || 'http://localhost:3005'
).replace(/\/$/, '');

const PROCUREMENT_ROLES = ['hoa_admin', 'super_admin', 'finance_officer', 'property_manager'];

function money(amount: any, currency: string): string {
  return `${currency} ${Number(amount?.toString?.() ?? amount).toLocaleString('en', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function dateText(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

@Injectable()
export class TendersService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private votes: VotesService,
  ) {}

  // ============ Admin ============

  async create(orgId: string, actor: Actor, dto: CreateTenderDto) {
    const closesAt = new Date(dto.closesAt);
    if (Number.isNaN(closesAt.getTime())) throw new BadRequestException('Invalid closesAt date');
    if (dto.budgetMin != null && dto.budgetMax != null && dto.budgetMax < dto.budgetMin) {
      throw new BadRequestException('budgetMax cannot be less than budgetMin');
    }
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { currency: true } });
    return this.prisma.tender.create({
      data: {
        organizationId: orgId,
        title: dto.title.trim(),
        description: dto.description.trim(),
        scopeOfWork: dto.scopeOfWork?.trim() || null,
        category: dto.category?.trim() || null,
        budgetMin: dto.budgetMin != null ? new Decimal(dto.budgetMin) : null,
        budgetMax: dto.budgetMax != null ? new Decimal(dto.budgetMax) : null,
        // Tenders always use the org's settings currency.
        currency: (org?.currency || 'ZAR').toUpperCase(),
        closesAt,
        attachments: (dto.attachments ?? []) as any,
        status: 'draft',
        createdBy: actor.userId,
      },
    });
  }

  /**
   * Draft a tender Summary or Scope of work with the assistant. Sends only the
   * title/category/context the admin typed — no resident PII. Falls back to the
   * mock LLM provider in dev (deterministic, offline). Returns plain text the
   * admin can edit before saving.
   */
  async aiDraft(orgId: string, dto: TenderAiDraftDto): Promise<{ text: string }> {
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('A tender title is required to draft text');
    const category = dto.category?.trim();
    const context = dto.context?.trim();

    const system =
      dto.field === 'summary'
        ? 'You are a procurement officer for an African residential estate / HOA. Write a concise, professional 2–3 sentence summary of a contract tender that vendors will read. Plain prose, no headings, no markdown, no em dashes. Do not invent budgets, dates, or vendor names.'
        : 'You are a procurement officer for an African residential estate / HOA. Draft a clear, well-structured scope of work for a contract tender: responsibilities, deliverables, frequency/standards, and what a compliant bid must include. Use short plain-text bullet lines (prefixed with "- "), no markdown headings, no em dashes. Do not invent budgets, dates, or vendor names.';

    const parts = [`Tender title: ${title}`];
    if (category) parts.push(`Category: ${category}`);
    if (context) parts.push(`Additional context from the manager: ${context}`);
    parts.push(
      dto.field === 'summary'
        ? 'Write the summary now.'
        : 'Write the scope of work now.',
    );

    const llm = createLlmProvider();
    const res = await llm.generate(
      [
        { role: 'system', content: system },
        { role: 'user', content: parts.join('\n') },
      ],
      { maxTokens: dto.field === 'summary' ? 300 : 900, temperature: 0.4 },
    );
    const text = (res.content || '').trim();
    if (!text) throw new BadRequestException('The assistant could not draft text. Try again or write it manually.');
    return { text };
  }

  async update(id: string, orgId: string, dto: UpdateTenderDto) {
    const t = await this.getRaw(id, orgId);
    if (t.status !== 'draft') throw new ConflictException('Only a draft tender can be edited');
    return this.prisma.tender.update({
      where: { id },
      data: {
        title: dto.title?.trim() ?? undefined,
        description: dto.description?.trim() ?? undefined,
        scopeOfWork: dto.scopeOfWork === undefined ? undefined : (dto.scopeOfWork?.trim() || null),
        category: dto.category === undefined ? undefined : (dto.category?.trim() || null),
        budgetMin: dto.budgetMin === undefined ? undefined : dto.budgetMin != null ? new Decimal(dto.budgetMin) : null,
        budgetMax: dto.budgetMax === undefined ? undefined : dto.budgetMax != null ? new Decimal(dto.budgetMax) : null,
        closesAt: dto.closesAt ? new Date(dto.closesAt) : undefined,
        attachments: dto.attachments ? (dto.attachments as any) : undefined,
      },
    });
  }

  async list(orgId: string, query: { status?: string }) {
    const where: any = { organizationId: orgId };
    if (query.status) where.status = query.status;
    const tenders = await this.prisma.tender.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { bids: true } } },
    });
    return tenders;
  }

  private async getRaw(id: string, orgId: string) {
    const t = await this.prisma.tender.findFirst({ where: { id, organizationId: orgId } });
    if (!t) throw new NotFoundException('Tender not found');
    return t;
  }

  async get(id: string, orgId: string) {
    const t = await this.prisma.tender.findFirst({
      where: { id, organizationId: orgId },
      include: {
        bids: {
          orderBy: { amount: 'asc' },
          include: { vendor: { select: { id: true, name: true, email: true, status: true, rating: true } } },
        },
      },
    });
    if (!t) throw new NotFoundException('Tender not found');
    let vote: any = null;
    if (t.voteId) {
      vote = await this.prisma.vote.findUnique({ where: { id: t.voteId } });
    }
    return { ...t, vote };
  }

  async open(id: string, orgId: string, _actor: Actor) {
    const t = await this.getRaw(id, orgId);
    if (t.status !== 'draft') throw new ConflictException(`Cannot open a tender in status ${t.status}`);
    if (new Date() > t.closesAt) throw new BadRequestException('closesAt is in the past');
    const opened = await this.prisma.tender.update({
      where: { id },
      data: { status: 'open', opensAt: new Date() },
    });
    await this.notifyActiveVendors(orgId, opened);
    return opened;
  }

  async close(id: string, orgId: string) {
    const t = await this.getRaw(id, orgId);
    if (t.status !== 'open') throw new ConflictException(`Cannot close a tender in status ${t.status}`);
    return this.prisma.tender.update({ where: { id }, data: { status: 'evaluating' } });
  }

  async shortlist(id: string, orgId: string, dto: ShortlistBidDto) {
    const t = await this.getRaw(id, orgId);
    if (!['open', 'evaluating'].includes(t.status)) {
      throw new ConflictException('Bids can only be shortlisted while open or evaluating');
    }
    const bid = await this.prisma.bid.findFirst({ where: { id: dto.bidId, tenderId: id } });
    if (!bid) throw new NotFoundException('Bid not found on this tender');
    const next = dto.shortlisted === false ? 'submitted' : 'shortlisted';
    return this.prisma.bid.update({ where: { id: bid.id }, data: { status: next } });
  }

  async startExcoVote(id: string, orgId: string, actor: Actor, dto: StartExcoVoteDto) {
    const t = await this.prisma.tender.findFirst({
      where: { id, organizationId: orgId },
      include: { bids: { include: { vendor: { select: { id: true, name: true } } } } },
    });
    if (!t) throw new NotFoundException('Tender not found');
    if (t.status !== 'evaluating') {
      throw new ConflictException('Close bidding (move to evaluating) before starting the Exco vote');
    }
    if (t.voteId) throw new ConflictException('An Exco vote already exists for this tender');

    const shortlisted = t.bids.filter((b) => b.status === 'shortlisted');
    const pool = shortlisted.length ? shortlisted : t.bids.filter((b) => b.status === 'submitted');
    if (pool.length < 1) throw new BadRequestException('There are no bids to vote on');

    const options = pool.map((b) => ({ id: b.id, label: `${b.vendor.name} — ${money(b.amount, b.currency)}` }));
    const days = dto?.closesInDays && dto.closesInDays > 0 ? dto.closesInDays : 7;
    const closesAt = new Date(Date.now() + days * 86400000);

    const vote = await this.prisma.vote.create({
      data: {
        organizationId: orgId,
        title: `Award contract: ${t.title}`,
        description: `Select the winning bid for "${t.title}".`,
        type: 'standard',
        status: 'draft',
        createdBy: actor.userId,
        options: options as any,
        allowMultiple: false,
        anonymous: false,
        eligibilityRule: 'exco_only',
        quorumPercent: 50,
        passThresholdPercent: 50,
        opensAt: new Date(),
        closesAt,
      },
    });
    await this.prisma.tender.update({ where: { id }, data: { voteId: vote.id } });
    // open() snapshots the eligible exco count + notifies exco members.
    await this.votes.open(vote.id, orgId, actor);
    return this.get(id, orgId);
  }

  async award(id: string, orgId: string, _actor: Actor, dto: AwardBidDto) {
    const t = await this.prisma.tender.findFirst({
      where: { id, organizationId: orgId },
      include: { bids: true },
    });
    if (!t) throw new NotFoundException('Tender not found');
    if (['awarded', 'cancelled', 'draft'].includes(t.status)) {
      throw new ConflictException(`Cannot award a tender in status ${t.status}`);
    }
    const winner = t.bids.find((b) => b.id === dto.bidId);
    if (!winner) throw new BadRequestException('That bid is not part of this tender');

    await this.prisma.$transaction([
      this.prisma.tender.update({
        where: { id },
        data: { status: 'awarded', awardedBidId: winner.id, awardedVendorId: winner.vendorId },
      }),
      this.prisma.bid.update({ where: { id: winner.id }, data: { status: 'awarded' } }),
      this.prisma.bid.updateMany({
        where: { tenderId: id, id: { not: winner.id }, status: { in: ['submitted', 'shortlisted'] } },
        data: { status: 'rejected' },
      }),
    ]);

    // Notify the winner + the unsuccessful bidders.
    await this.notifyVendor(winner.vendorId, id, {
      title: `Contract awarded: ${t.title}`,
      body: `Congratulations — your bid for "${t.title}" has been selected.`,
      email: {
        subject: `You've been awarded the contract: ${t.title}`,
        message: `Good news — your bid for "${t.title}" has been selected as the winning bid.\n\nThe HOA office will be in touch with next steps.`,
        ctaLabel: 'View tender',
        ctaUrl: `${RESIDENT_BASE}/vendor/tenders/${t.id}`,
      },
    });
    for (const b of t.bids) {
      if (b.id === winner.id) continue;
      await this.notifyVendor(b.vendorId, id, {
        title: `Contract decision: ${t.title}`,
        body: `The contract "${t.title}" has been awarded to another bidder.`,
        email: {
          subject: `Outcome of "${t.title}"`,
          message: `Thank you for bidding on "${t.title}". On this occasion the contract was awarded to another vendor.\n\nWe value your participation and look forward to future opportunities.`,
          ctaLabel: 'View tender',
          ctaUrl: `${RESIDENT_BASE}/vendor/tenders/${t.id}`,
        },
      });
    }
    return this.get(id, orgId);
  }

  async cancel(id: string, orgId: string) {
    const t = await this.getRaw(id, orgId);
    if (['awarded', 'cancelled'].includes(t.status)) {
      throw new ConflictException(`Cannot cancel a tender in status ${t.status}`);
    }
    return this.prisma.tender.update({ where: { id }, data: { status: 'cancelled' } });
  }

  // ============ Vendor portal ============

  private async vendorForUser(userId: string, orgId: string) {
    const vendor = await this.prisma.vendor.findFirst({ where: { userId, organizationId: orgId } });
    if (!vendor) throw new ForbiddenException('No vendor profile is linked to your account.');
    return vendor;
  }

  async listOpenForVendor(userId: string, orgId: string) {
    const vendor = await this.vendorForUser(userId, orgId);
    const tenders = await this.prisma.tender.findMany({
      where: { organizationId: orgId, status: 'open' },
      orderBy: { closesAt: 'asc' },
    });
    const myBids = await this.prisma.bid.findMany({
      where: { vendorId: vendor.id, tenderId: { in: tenders.map((t) => t.id) } },
      select: { tenderId: true, status: true },
    });
    const byTender = new Map(myBids.map((b) => [b.tenderId, b.status]));
    return tenders.map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      currency: t.currency,
      budgetMin: t.budgetMin,
      budgetMax: t.budgetMax,
      closesAt: t.closesAt,
      myBidStatus: byTender.get(t.id) ?? null,
    }));
  }

  async getForVendor(id: string, userId: string, orgId: string) {
    const vendor = await this.vendorForUser(userId, orgId);
    const t = await this.prisma.tender.findFirst({ where: { id, organizationId: orgId } });
    if (!t) throw new NotFoundException('Tender not found');
    const myBid = await this.prisma.bid.findFirst({ where: { tenderId: id, vendorId: vendor.id } });
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      scopeOfWork: t.scopeOfWork,
      category: t.category,
      currency: t.currency,
      budgetMin: t.budgetMin,
      budgetMax: t.budgetMax,
      status: t.status,
      opensAt: t.opensAt,
      closesAt: t.closesAt,
      attachments: t.attachments,
      myBid,
      canBid: t.status === 'open' && new Date() <= t.closesAt && vendor.status === 'active',
    };
  }

  async submitBid(userId: string, orgId: string, dto: SubmitBidDto) {
    const vendor = await this.vendorForUser(userId, orgId);
    if (vendor.status !== 'active') throw new ForbiddenException('Your vendor account is not active.');
    const t = await this.prisma.tender.findFirst({ where: { id: dto.tenderId, organizationId: orgId } });
    if (!t) throw new NotFoundException('Tender not found');
    if (t.status !== 'open') throw new ConflictException('This tender is not open for bids.');
    if (new Date() > t.closesAt) throw new ConflictException('The bidding deadline has passed.');

    const currency = (dto.currency || t.currency || vendor.preferredCurrency || 'ZAR').toUpperCase();
    const bid = await this.prisma.bid.upsert({
      where: { tenderId_vendorId: { tenderId: t.id, vendorId: vendor.id } },
      update: {
        amount: new Decimal(dto.amount),
        currency,
        proposal: dto.proposal,
        attachments: (dto.attachments ?? []) as any,
        status: 'submitted',
        submittedBy: userId,
      },
      create: {
        tenderId: t.id,
        organizationId: orgId,
        vendorId: vendor.id,
        amount: new Decimal(dto.amount),
        currency,
        proposal: dto.proposal,
        attachments: (dto.attachments ?? []) as any,
        submittedBy: userId,
      },
    });
    await this.notifyProcurement(orgId, t, bid, vendor.name);
    return bid;
  }

  // ============ Notifications ============

  private async notifyActiveVendors(orgId: string, tender: any) {
    const vendors = await this.prisma.vendor.findMany({
      where: { organizationId: orgId, status: 'active' },
      select: { id: true, userId: true, email: true, name: true },
    });
    const email = {
      subject: `New contract opportunity: ${tender.title}`,
      message: `A new tender, "${tender.title}", is open for bids until ${dateText(tender.closesAt)}.\n\nSign in to your vendor portal to review the details and submit a bid.`,
      ctaLabel: 'View tender',
      ctaUrl: `${RESIDENT_BASE}/vendor/tenders/${tender.id}`,
    };
    for (const v of vendors) {
      if (v.userId) {
        await this.notifications.enqueueFor({
          organizationId: orgId,
          recipientUserIds: [v.userId],
          type: 'tender_opened',
          title: `New tender: ${tender.title}`,
          body: `Open for bids until ${dateText(tender.closesAt)}.`,
          entityType: 'Tender',
          entityId: tender.id,
          actionUrl: `/vendor/tenders/${tender.id}`,
          alsoEmail: email,
        });
      } else if (v.email) {
        await this.notifications.emailExternal({
          organizationId: orgId,
          to: v.email,
          recipientName: v.name,
          subject: email.subject,
          message: email.message,
          ctaLabel: email.ctaLabel,
          ctaUrl: email.ctaUrl,
          entityType: 'Tender',
          entityId: `${tender.id}:open`,
        });
      }
    }
  }

  private async notifyProcurement(orgId: string, tender: any, bid: any, vendorName: string) {
    const roles = await this.prisma.userRole.findMany({
      where: { organizationId: orgId, role: { name: { in: PROCUREMENT_ROLES } } },
      select: { userId: true },
    });
    const ids = Array.from(new Set(roles.map((r) => r.userId)));
    if (!ids.length) return;
    await this.notifications.enqueueFor({
      organizationId: orgId,
      recipientUserIds: ids,
      type: 'bid_submitted',
      title: `New bid: ${tender.title}`,
      body: `${vendorName} submitted a bid of ${money(bid.amount, bid.currency)}.`,
      entityType: 'Tender',
      entityId: tender.id,
      actionUrl: `/contracts/${tender.id}`,
    });
  }

  private async notifyVendor(
    vendorId: string,
    tenderId: string,
    p: { title: string; body: string; email: { subject: string; message: string; ctaLabel?: string; ctaUrl?: string } },
  ) {
    const v = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, userId: true, email: true, name: true, organizationId: true },
    });
    if (!v) return;
    if (v.userId) {
      await this.notifications.enqueueFor({
        organizationId: v.organizationId,
        recipientUserIds: [v.userId],
        type: 'tender_update',
        title: p.title,
        body: p.body,
        entityType: 'Tender',
        entityId: tenderId,
        actionUrl: `/vendor/tenders/${tenderId}`,
        alsoEmail: p.email,
      });
    } else if (v.email) {
      await this.notifications.emailExternal({
        organizationId: v.organizationId,
        to: v.email,
        recipientName: v.name,
        subject: p.email.subject,
        message: p.email.message,
        ctaLabel: p.email.ctaLabel,
        ctaUrl: p.email.ctaUrl,
        entityType: 'Tender',
        entityId: `${tenderId}:${vendorId}`,
      });
    }
  }
}
