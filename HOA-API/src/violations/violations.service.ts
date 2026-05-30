import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';
import { Actor, scopeViolationWhere, actorOccupiesUnit, isResidentRole } from '../common/scope.util';
import { NotificationsService } from '../notifications/notifications.service';
import { WebhooksService } from '../platform/webhooks.service';
import {
  CreateViolationDto,
  CreateCategoryDto,
  IssueNoticeDto,
  IssueFineDto,
  ResolveViolationDto,
  CreateAppealDto,
  DecideAppealDto,
  ALLOWED_CONTENT_TYPES,
} from './dto/create-violation.dto';

// Server-side state machine. Any transition not listed is rejected with 409.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  open: ['noticed', 'closed'],
  noticed: ['acknowledged', 'appealing', 'closed'],
  acknowledged: ['appealing', 'closed'],
  appealing: ['board_review'],
  board_review: ['upheld', 'dismissed'],
  upheld: ['closed'],
  dismissed: ['closed'],
  closed: [],
};

const APPEAL_TRANSITIONS: Record<string, string[]> = {
  submitted: ['reviewing', 'upheld', 'dismissed'],
  reviewing: ['upheld', 'dismissed'],
  upheld: [],
  dismissed: [],
};

@Injectable()
export class ViolationsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private webhooks: WebhooksService,
  ) {}

  // ============ Categories ============

  async listCategories(orgId: string) {
    return this.prisma.violationCategory.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(orgId: string, dto: CreateCategoryDto) {
    try {
      return await this.prisma.violationCategory.create({
        data: {
          organizationId: orgId,
          name: dto.name.trim(),
          description: dto.description,
          defaultFine: dto.defaultFine != null ? new Decimal(dto.defaultFine) : null,
          fineCurrency: dto.fineCurrency || 'ZAR',
          noticeTemplate: dto.noticeTemplate,
          graceDays: dto.graceDays ?? 7,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException(`Category "${dto.name}" already exists`);
      }
      throw err;
    }
  }

  async updateCategory(id: string, orgId: string, dto: Partial<CreateCategoryDto>) {
    const cat = await this.prisma.violationCategory.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!cat) throw new NotFoundException('Category not found');
    return this.prisma.violationCategory.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.defaultFine !== undefined && {
          defaultFine: dto.defaultFine != null ? new Decimal(dto.defaultFine) : null,
        }),
        ...(dto.fineCurrency && { fineCurrency: dto.fineCurrency }),
        ...(dto.noticeTemplate !== undefined && { noticeTemplate: dto.noticeTemplate }),
        ...(dto.graceDays !== undefined && { graceDays: dto.graceDays }),
      },
    });
  }

  // ============ Violations ============

  async list(
    orgId: string,
    actor: Actor,
    query: {
      page?: number;
      limit?: number;
      status?: string;
      unitId?: string;
      categoryId?: string;
      from?: string;
      to?: string;
    },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 30));
    const baseWhere: any = { organizationId: orgId };
    if (query.status) baseWhere.status = query.status;
    if (query.unitId) baseWhere.unitId = query.unitId;
    if (query.categoryId) baseWhere.categoryId = query.categoryId;
    if (query.from || query.to) {
      baseWhere.occurredAt = {};
      if (query.from) baseWhere.occurredAt.gte = new Date(query.from);
      if (query.to) baseWhere.occurredAt.lte = new Date(query.to);
    }
    const where = scopeViolationWhere(baseWhere, actor);

    const [data, total] = await Promise.all([
      this.prisma.violation.findMany({
        where,
        include: {
          category: true,
          unit: { include: { estate: true } },
          appeals: { orderBy: { submittedAt: 'desc' } },
        },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.violation.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string, orgId: string, actor: Actor) {
    const baseWhere: any = { id, organizationId: orgId };
    const where = scopeViolationWhere(baseWhere, actor);
    const isResident = isResidentRole(actor.role);
    const v = await this.prisma.violation.findFirst({
      where,
      include: {
        category: true,
        unit: {
          include: {
            estate: true,
            // Residents see violations on their unit but must not see PII of
            // co-occupants. Admins/board get full occupancy detail.
            occupancies: isResident
              ? false
              : { where: { isActive: true }, include: { person: true } },
          },
        },
        appeals: { orderBy: { submittedAt: 'desc' } },
        events: { orderBy: { createdAt: 'desc' }, take: 50 },
        fineInvoice: true,
      },
    });
    if (!v) throw new NotFoundException('Violation not found');
    return v;
  }

  async create(orgId: string, actor: Actor, dto: CreateViolationDto) {
    // Validate category belongs to org and is active
    const cat = await this.prisma.violationCategory.findFirst({
      where: { id: dto.categoryId, organizationId: orgId, isActive: true },
    });
    if (!cat) throw new NotFoundException('Category not found');

    // Validate unit belongs to org
    const unit = await this.prisma.unit.findFirst({
      where: { id: dto.unitId, estate: { organizationId: orgId } },
    });
    if (!unit) throw new NotFoundException('Unit not found');

    // Validate photo content types
    const photos = dto.photos || [];
    for (const p of photos) {
      if (!ALLOWED_CONTENT_TYPES.includes(p.contentType)) {
        throw new BadRequestException(`Photo content type ${p.contentType} not allowed`);
      }
    }

    const v = await this.prisma.$transaction(async (tx) => {
      const violation = await tx.violation.create({
        data: {
          organizationId: orgId,
          unitId: dto.unitId,
          categoryId: dto.categoryId,
          status: 'open',
          occurredAt: new Date(dto.occurredAt),
          reportedBy: actor.userId,
          description: dto.description,
          photos: photos as any,
        },
        include: { category: true, unit: { include: { estate: true } } },
      });

      await tx.violationEvent.create({
        data: {
          violationId: violation.id,
          actorId: actor.userId,
          type: 'created',
          payload: { categoryId: dto.categoryId, photoCount: photos.length },
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'create',
          entityType: 'Violation',
          entityId: violation.id,
          changes: { after: { status: 'open', categoryId: dto.categoryId, unitId: dto.unitId } } as any,
        },
      });

      return violation;
    });

    // Phase 9.2: webhook for HOA-integrated communication / compliance tools.
    this.webhooks.emit(orgId, 'violation.created', {
      violationId: v.id,
      unitId: v.unitId,
      categoryId: v.categoryId,
      categoryName: (v as any).category?.name,
      status: v.status,
      occurredAt: v.occurredAt.toISOString(),
      description: v.description,
      photoCount: photos.length,
    });

    return v;
  }

  private assertTransition(from: string, to: string) {
    const allowed = ALLOWED_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      throw new ConflictException(`Cannot transition violation from ${from} to ${to}`);
    }
  }

  async issueNotice(id: string, orgId: string, actor: Actor, dto: IssueNoticeDto) {
    const v = await this.prisma.violation.findFirst({
      where: { id, organizationId: orgId },
      include: { category: true, unit: { include: { occupancies: { where: { isActive: true }, include: { person: true } } } } },
    });
    if (!v) throw new NotFoundException('Violation not found');
    if (v.noticeSentAt && !dto.forceResend) {
      throw new ConflictException('Notice already sent. Pass forceResend=true to resend.');
    }
    if (!dto.forceResend) {
      this.assertTransition(v.status, 'noticed');
    }

    // Recipients: linked users of active occupancies
    const recipientUserIds = v.unit?.occupancies
      .map((o) => o.person.userId)
      .filter((u): u is string => Boolean(u)) || [];

    const updated = await this.prisma.$transaction(async (tx) => {
      const violation = await tx.violation.update({
        where: { id },
        data: {
          status: dto.forceResend ? v.status : 'noticed',
          noticeSentAt: new Date(),
        },
      });
      await tx.violationEvent.create({
        data: {
          violationId: id,
          actorId: actor.userId,
          type: 'notice_sent',
          payload: { recipientCount: recipientUserIds.length, resend: !!dto.forceResend },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'notice_sent',
          entityType: 'Violation',
          entityId: id,
          changes: { before: { status: v.status }, after: { status: violation.status, noticeSentAt: violation.noticeSentAt } } as any,
        },
      });
      return violation;
    });

    if (recipientUserIds.length > 0) {
      const residentBase = process.env.RESIDENT_BASE_URL || process.env.RESIDENTS_BASE_URL || 'http://localhost:3002';
      await this.notifications.enqueueFor({
        organizationId: orgId,
        recipientUserIds,
        type: 'violation_issued',
        title: `Violation notice: ${v.category.name}`,
        body: v.description.slice(0, 280),
        entityType: 'Violation',
        entityId: id,
        actionUrl: `/violations/${id}`,
        // Real transactional email (the announcement template) instead of a
        // queued broadcast row that nothing dispatches.
        alsoEmail: {
          subject: `Violation notice: ${v.category.name}`,
          message: v.description,
          ctaLabel: 'View the notice',
          ctaUrl: `${residentBase}/violations/${id}`,
        },
      });
    }

    return updated;
  }

  async issueFine(id: string, orgId: string, actor: Actor, dto: IssueFineDto) {
    const v = await this.prisma.violation.findFirst({
      where: { id, organizationId: orgId },
      include: { category: true, unit: true, fineInvoice: true },
    });
    if (!v) throw new NotFoundException('Violation not found');
    if (v.fineInvoiceId) {
      // Idempotent on the entity itself — return existing
      const inv = await this.prisma.invoice.findUnique({ where: { id: v.fineInvoiceId } });
      return { violation: v, invoice: inv, idempotent: true };
    }
    if (v.status === 'closed' || v.status === 'dismissed') {
      throw new ConflictException(`Cannot fine a ${v.status} violation`);
    }

    const amount = dto.amount ?? (v.category.defaultFine ? Number(v.category.defaultFine) : null);
    if (amount == null || amount <= 0) {
      throw new BadRequestException('Fine amount required (no default on category)');
    }
    const currency = dto.currency || v.category.fineCurrency || 'ZAR';

    const result = await this.prisma.$transaction(async (tx) => {
      const count = await tx.invoice.count({ where: { organizationId: orgId } });
      const invoiceNumber = `FINE-${String(count + 1).padStart(5, '0')}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (v.category.graceDays ?? 7));

      const invoice = await tx.invoice.create({
        data: {
          organizationId: orgId,
          unitId: v.unitId,
          invoiceNumber,
          type: 'fine',
          amount: new Decimal(amount),
          currency,
          dueDate,
          lineItems: [
            {
              description: `Fine: ${v.category.name}`,
              amount,
              quantity: 1,
            },
          ] as any,
          notes: `Auto-issued for violation ${id}`,
          createdBy: actor.userId,
          status: 'sent',
          sentAt: new Date(),
        },
      });

      const violation = await tx.violation.update({
        where: { id },
        data: {
          fineAmount: new Decimal(amount),
          fineCurrency: currency,
          fineInvoiceId: invoice.id,
        },
      });

      await tx.violationEvent.create({
        data: {
          violationId: id,
          actorId: actor.userId,
          type: 'fine_issued',
          payload: { invoiceId: invoice.id, amount, currency },
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'fine_issued',
          entityType: 'Violation',
          entityId: id,
          changes: { after: { fineInvoiceId: invoice.id, fineAmount: amount, fineCurrency: currency } } as any,
        },
      });

      return { violation, invoice };
    });

    return { ...result, idempotent: false };
  }

  async acknowledge(id: string, orgId: string, actor: Actor) {
    if (!isResidentRole(actor.role)) {
      throw new ForbiddenException('Only residents acknowledge their own violations');
    }
    const v = await this.prisma.violation.findFirst({ where: { id, organizationId: orgId } });
    if (!v) throw new NotFoundException('Violation not found');
    const allowed = await actorOccupiesUnit(this.prisma, actor, v.unitId);
    if (!allowed) throw new ForbiddenException();
    this.assertTransition(v.status, 'acknowledged');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.violation.update({
        where: { id },
        data: { status: 'acknowledged', acknowledgedAt: new Date() },
      });
      await tx.violationEvent.create({
        data: { violationId: id, actorId: actor.userId, type: 'acknowledged', payload: {} },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'acknowledged',
          entityType: 'Violation',
          entityId: id,
          changes: { before: { status: v.status }, after: { status: 'acknowledged' } } as any,
        },
      });
      return updated;
    });
  }

  async resolve(id: string, orgId: string, actor: Actor, dto: ResolveViolationDto) {
    const v = await this.prisma.violation.findFirst({ where: { id, organizationId: orgId } });
    if (!v) throw new NotFoundException('Violation not found');
    const outcome = dto.outcome || 'closed';
    this.assertTransition(v.status, outcome);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.violation.update({
        where: { id },
        data: { status: outcome, resolvedAt: new Date(), resolvedBy: actor.userId, closedAt: outcome === 'closed' ? new Date() : null },
      });
      await tx.violationEvent.create({
        data: { violationId: id, actorId: actor.userId, type: outcome, payload: { notes: dto.notes } },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: outcome,
          entityType: 'Violation',
          entityId: id,
          changes: { before: { status: v.status }, after: { status: outcome } } as any,
        },
      });
      return updated;
    });
  }

  // ============ Appeals ============

  async submitAppeal(violationId: string, orgId: string, actor: Actor, dto: CreateAppealDto) {
    if (!isResidentRole(actor.role)) throw new ForbiddenException();
    const v = await this.prisma.violation.findFirst({ where: { id: violationId, organizationId: orgId } });
    if (!v) throw new NotFoundException('Violation not found');
    const allowed = await actorOccupiesUnit(this.prisma, actor, v.unitId);
    if (!allowed) throw new ForbiddenException();
    if (v.status !== 'noticed' && v.status !== 'acknowledged') {
      throw new ConflictException(`Cannot appeal a violation in status ${v.status}`);
    }

    // Within grace period check
    if (v.noticeSentAt) {
      const cat = await this.prisma.violationCategory.findUnique({ where: { id: v.categoryId } });
      const graceDays = cat?.graceDays ?? 7;
      const deadline = new Date(v.noticeSentAt);
      deadline.setDate(deadline.getDate() + graceDays);
      if (new Date() > deadline) {
        throw new ConflictException(`Appeal window has closed (${graceDays}-day grace period)`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const appeal = await tx.violationAppeal.create({
        data: {
          violationId,
          submittedBy: actor.userId,
          reason: dto.reason,
          evidence: (dto.evidence || []) as any,
        },
      });
      const updated = await tx.violation.update({
        where: { id: violationId },
        data: { status: 'appealing' },
      });
      await tx.violationEvent.create({
        data: { violationId, actorId: actor.userId, type: 'appeal_submitted', payload: { appealId: appeal.id } },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'appeal_submitted',
          entityType: 'Violation',
          entityId: violationId,
          changes: { after: { appealId: appeal.id, status: 'appealing' } } as any,
        },
      });

      return { appeal, violation: updated };
    });
  }

  async decideAppeal(appealId: string, orgId: string, actor: Actor, dto: DecideAppealDto) {
    const appeal = await this.prisma.violationAppeal.findFirst({
      where: { id: appealId, violation: { organizationId: orgId } },
      include: { violation: true },
    });
    if (!appeal) throw new NotFoundException('Appeal not found');
    if (!APPEAL_TRANSITIONS[appeal.status]?.includes(dto.decision)) {
      throw new ConflictException(`Cannot transition appeal from ${appeal.status} to ${dto.decision}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const decided = await tx.violationAppeal.update({
        where: { id: appealId },
        data: {
          status: dto.decision,
          decidedAt: new Date(),
          decidedBy: actor.userId,
          decisionNotes: dto.notes,
        },
      });
      // Transition parent violation: if dismissed (appeal rejected), violation stays upheld; if upheld (appeal accepted), violation moves to dismissed
      const violationOutcome = dto.decision === 'dismissed' ? 'upheld' : 'dismissed';
      const updatedViolation = await tx.violation.update({
        where: { id: appeal.violationId },
        data: { status: violationOutcome },
      });
      await tx.violationEvent.create({
        data: {
          violationId: appeal.violationId,
          actorId: actor.userId,
          type: 'appeal_decided',
          payload: { decision: dto.decision, notes: dto.notes },
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'appeal_decided',
          entityType: 'ViolationAppeal',
          entityId: appealId,
          changes: { before: { status: appeal.status }, after: { status: dto.decision } } as any,
        },
      });
      return { appeal: decided, violation: updatedViolation };
    });
  }

  // ============ Analytics ============

  async byUnit(orgId: string) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);
    const grouped = await this.prisma.violation.groupBy({
      by: ['unitId'],
      where: { organizationId: orgId, occurredAt: { gte: cutoff } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 50,
    });

    if (grouped.length === 0) return { success: true, data: [] };
    const unitIds = grouped.map((g) => g.unitId);
    const units = await this.prisma.unit.findMany({
      where: { id: { in: unitIds } },
      include: { estate: true },
    });
    const byId = Object.fromEntries(units.map((u) => [u.id, u]));
    const data = grouped.map((g) => ({
      unitId: g.unitId,
      count: g._count.id,
      unit: byId[g.unitId],
      isRepeatOffender: g._count.id >= 3,
    }));
    return { success: true, data };
  }

  async byCategory(orgId: string) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);
    const grouped = await this.prisma.violation.groupBy({
      by: ['categoryId'],
      where: { organizationId: orgId, occurredAt: { gte: cutoff } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    if (grouped.length === 0) return { success: true, data: [] };
    const categoryIds = grouped.map((g) => g.categoryId);
    const cats = await this.prisma.violationCategory.findMany({ where: { id: { in: categoryIds } } });
    const byId = Object.fromEntries(cats.map((c) => [c.id, c]));
    const data = grouped.map((g) => ({ categoryId: g.categoryId, count: g._count.id, category: byId[g.categoryId] }));
    return { success: true, data };
  }
}
