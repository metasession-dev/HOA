import {
  Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Actor, isResidentRole, scopeRequestWhere, actorOccupiesUnit } from '../common/scope.util';
import { NotificationsService } from '../notifications/notifications.service';
import { WebhooksService } from '../platform/webhooks.service';

/**
 * Phase 1.1 Resident Requests.
 *
 * State machine — every transition must be in this table or the service
 * raises 409. Keeps audit trails sane and prevents resurrection bugs.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  submitted:         ['triaged', 'in_progress', 'cancelled'],
  triaged:           ['in_progress', 'waiting_resident', 'resolved', 'cancelled'],
  in_progress:       ['waiting_resident', 'resolved', 'cancelled'],
  waiting_resident:  ['in_progress', 'resolved', 'cancelled'],
  resolved:          ['closed', 'in_progress'], // reopen path
  closed:            [],
  cancelled:         [],
};

const ALLOWED_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

/**
 * Default category set seeded on first use. Covers the request types most HOAs
 * field daily — admin can rename/disable any of them or add their own. Kept
 * deliberately small so the dropdown isn't overwhelming.
 *
 * SLA hours are starter values (24h is "respond by tomorrow"); admins can
 * tune them per-org without touching code.
 */
const DEFAULT_CATEGORIES: Array<{
  name: string;
  description: string;
  defaultPriority: 'low' | 'normal' | 'high' | 'urgent';
  slaResolveHours: number;
  assignToRoles: string[];
}> = [
  { name: 'Maintenance — general', description: 'Repairs to common areas, fixtures, light bulbs, paint, signage.', defaultPriority: 'normal', slaResolveHours: 72, assignToRoles: ['maintenance_coordinator', 'property_manager'] },
  { name: 'Plumbing', description: 'Leaks, blockages, water pressure, geyser issues.', defaultPriority: 'high', slaResolveHours: 24, assignToRoles: ['maintenance_coordinator', 'property_manager'] },
  { name: 'Electrical', description: 'Power outages, faulty wiring, exterior lights.', defaultPriority: 'high', slaResolveHours: 24, assignToRoles: ['maintenance_coordinator', 'property_manager'] },
  { name: 'Security & access', description: 'Gate, intercom, alarms, lost remotes.', defaultPriority: 'high', slaResolveHours: 24, assignToRoles: ['gate_security', 'property_manager'] },
  { name: 'Cleaning & landscaping', description: 'Common areas, gardens, refuse, pest control.', defaultPriority: 'normal', slaResolveHours: 72, assignToRoles: ['property_manager'] },
  { name: 'Noise & nuisance', description: 'Disturbances, parties, pets, smoking complaints.', defaultPriority: 'normal', slaResolveHours: 48, assignToRoles: ['property_manager'] },
  { name: 'Billing & levies', description: 'Invoice queries, payment disputes, statement requests.', defaultPriority: 'normal', slaResolveHours: 48, assignToRoles: ['finance_officer', 'property_manager'] },
  { name: 'Move-in / move-out', description: 'Coordinating arrivals, departures, key handovers, deposits.', defaultPriority: 'normal', slaResolveHours: 72, assignToRoles: ['property_manager'] },
  { name: 'Suggestion / feedback', description: 'Ideas or feedback on how the HOA is run.', defaultPriority: 'low', slaResolveHours: 168, assignToRoles: ['exco_member', 'property_manager'] },
  { name: 'Other', description: 'Anything that doesn\'t fit the categories above.', defaultPriority: 'normal', slaResolveHours: 72, assignToRoles: ['property_manager'] },
];

/**
 * Seed the default category set for an org if it has none. Idempotent —
 * uses a single create+skipDuplicates and a fresh isActive check so calling
 * it twice on the same org is safe. Called inline from listCategories when
 * the result is empty (so existing orgs self-heal on first resident visit
 * to /requests/new) and from auth.register on org creation.
 */
export async function ensureDefaultRequestCategories(
  prisma: PrismaService,
  organizationId: string,
): Promise<void> {
  const count = await prisma.requestCategory.count({
    where: { organizationId, isActive: true },
  });
  if (count > 0) return;
  await prisma.requestCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, organizationId })),
    skipDuplicates: true,
  });
}

const MAX_ATTACHMENTS = 10;
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
]);

export type AttachmentInput = { url: string; filename: string; contentType: string; size: number };

@Injectable()
export class RequestsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private webhooks: WebhooksService,
  ) {}

  // ============ Categories ============

  async listCategories(orgId: string, includeInactive = false) {
    // Self-healing seed: any org that hits this without categories gets the
    // default set the first time a resident loads `/requests/new`. Idempotent
    // — `ensureDefaultRequestCategories` is a no-op once any category exists,
    // so admins who customised theirs aren't disturbed.
    await ensureDefaultRequestCategories(this.prisma, orgId);
    return this.prisma.requestCategory.findMany({
      where: { organizationId: orgId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(
    orgId: string,
    actor: Actor,
    dto: { name: string; description?: string; defaultPriority?: string; slaResolveHours?: number; assignToRoles?: string[] },
  ) {
    if (!dto.name || dto.name.length > 80) {
      throw new BadRequestException('name is required (≤80 chars)');
    }
    if (dto.defaultPriority && !ALLOWED_PRIORITIES.includes(dto.defaultPriority as any)) {
      throw new BadRequestException(`defaultPriority must be one of ${ALLOWED_PRIORITIES.join(', ')}`);
    }
    if (dto.slaResolveHours !== undefined && (dto.slaResolveHours < 1 || dto.slaResolveHours > 24 * 365)) {
      throw new BadRequestException('slaResolveHours must be 1..8760');
    }
    return this.prisma.$transaction(async (tx) => {
      const cat = await tx.requestCategory.create({
        data: {
          organizationId: orgId,
          name: dto.name,
          description: dto.description,
          defaultPriority: dto.defaultPriority || 'normal',
          slaResolveHours: dto.slaResolveHours,
          assignToRoles: dto.assignToRoles || [],
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'request_category_created',
          entityType: 'RequestCategory',
          entityId: cat.id,
          changes: { name: cat.name, slaResolveHours: cat.slaResolveHours, assignToRoles: cat.assignToRoles } as any,
        },
      });
      return cat;
    });
  }

  async updateCategory(
    orgId: string,
    actor: Actor,
    id: string,
    dto: { name?: string; description?: string; defaultPriority?: string; slaResolveHours?: number; assignToRoles?: string[]; isActive?: boolean },
  ) {
    const existing = await this.prisma.requestCategory.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Category not found');
    if (dto.defaultPriority && !ALLOWED_PRIORITIES.includes(dto.defaultPriority as any)) {
      throw new BadRequestException(`defaultPriority must be one of ${ALLOWED_PRIORITIES.join(', ')}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.requestCategory.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          defaultPriority: dto.defaultPriority,
          slaResolveHours: dto.slaResolveHours,
          assignToRoles: dto.assignToRoles,
          isActive: dto.isActive,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'request_category_updated',
          entityType: 'RequestCategory',
          entityId: id,
          changes: { before: { name: existing.name, slaResolveHours: existing.slaResolveHours, isActive: existing.isActive }, after: { name: updated.name, slaResolveHours: updated.slaResolveHours, isActive: updated.isActive } } as any,
        },
      });
      return updated;
    });
  }

  // ============ Requests ============

  async list(
    orgId: string,
    actor: Actor,
    query: { status?: string; categoryId?: string; assignedToUserId?: string; priority?: string; overdue?: string; unitId?: string; page?: string; limit?: string },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    let where: any = { organizationId: orgId };
    if (query.status) where.status = query.status;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.assignedToUserId) where.assignedToUserId = query.assignedToUserId;
    if (query.priority) where.priority = query.priority;
    if (query.unitId) where.unitId = query.unitId;
    if (query.overdue === 'true') {
      where.dueAt = { lt: new Date() };
      where.status = { notIn: ['resolved', 'closed', 'cancelled'] };
    }
    where = scopeRequestWhere(where, actor);

    const [data, total] = await Promise.all([
      this.prisma.request.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slaResolveHours: true } },
          unit: { select: { id: true, unitNumber: true, estate: { select: { id: true, name: true } } } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.request.count({ where }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(orgId: string, actor: Actor, id: string) {
    const where = scopeRequestWhere({ id, organizationId: orgId }, actor);
    const req = await this.prisma.request.findFirst({
      where,
      include: {
        category: true,
        unit: { include: { estate: true } },
        comments: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!req) throw new NotFoundException('Request not found');
    // Residents never see internal comments.
    if (isResidentRole(actor.role)) {
      req.comments = req.comments.filter((c: any) => !c.isInternal);
    }
    return req;
  }

  async create(
    orgId: string,
    actor: Actor,
    dto: { categoryId: string; subject: string; body: string; unitId?: string; priority?: string; attachments?: AttachmentInput[] },
  ) {
    if (!dto.subject || dto.subject.length > 200) {
      throw new BadRequestException('subject is required (≤200 chars)');
    }
    if (!dto.body || dto.body.length > 8000) {
      throw new BadRequestException('body is required (≤8000 chars)');
    }
    const category = await this.prisma.requestCategory.findFirst({
      where: { id: dto.categoryId, organizationId: orgId, isActive: true },
    });
    if (!category) throw new BadRequestException('Invalid category');

    const priority = dto.priority || category.defaultPriority;
    if (!ALLOWED_PRIORITIES.includes(priority as any)) {
      throw new BadRequestException(`priority must be one of ${ALLOWED_PRIORITIES.join(', ')}`);
    }

    // Residents must scope to a unit they occupy. Admins MAY omit unitId for
    // "general estate" requests but if they pass one, it must belong to this org.
    let unitId = dto.unitId || null;
    if (isResidentRole(actor.role)) {
      if (!unitId) throw new BadRequestException('unitId is required');
      if (!(await actorOccupiesUnit(this.prisma, actor, unitId))) {
        throw new ForbiddenException('Cannot file a request against a unit you do not occupy');
      }
    } else if (unitId) {
      const unit = await this.prisma.unit.findFirst({
        where: { id: unitId, estate: { organizationId: orgId } },
      });
      if (!unit) throw new BadRequestException('Unit does not belong to this organization');
    }

    this.validateAttachments(dto.attachments);

    const dueAt = category.slaResolveHours
      ? new Date(Date.now() + category.slaResolveHours * 3600 * 1000)
      : null;

    const req = await this.prisma.$transaction(async (tx) => {
      const r = await tx.request.create({
        data: {
          organizationId: orgId,
          unitId,
          submittedByUserId: actor.userId,
          categoryId: category.id,
          subject: dto.subject,
          body: dto.body,
          priority,
          attachments: (dto.attachments || []) as any,
          status: 'submitted',
          dueAt,
        },
        include: { category: true, unit: true },
      });
      await tx.requestEvent.create({
        data: {
          requestId: r.id,
          actorId: actor.userId,
          type: 'submitted',
          payload: { categoryId: category.id, priority } as any,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'request_submitted',
          entityType: 'Request',
          entityId: r.id,
          changes: { categoryId: category.id, unitId, priority } as any,
        },
      });
      return r;
    });

    // Notify category auto-assignees + property managers. Email/SMS dispatch
    // arrives once Phase 2.x lands; for now this lights up the in-app bell.
    await this.notifyAdminsOnNewRequest(orgId, req);

    this.webhooks.emit(orgId, 'request.submitted' as any, {
      requestId: req.id,
      categoryId: req.categoryId,
      categoryName: (req as any).category?.name,
      unitId: req.unitId,
      priority: req.priority,
      subject: req.subject,
      submittedByUserId: req.submittedByUserId,
    });

    return req;
  }

  private async notifyAdminsOnNewRequest(orgId: string, req: any) {
    const recipientUserIds = await this.findAdminRecipients(orgId, req.category?.assignToRoles || []);
    if (recipientUserIds.length === 0) return;
    await this.notifications.enqueueFor({
      organizationId: orgId,
      recipientUserIds,
      type: 'request_submitted',
      title: `New request: ${req.subject}`,
      body: `Category: ${req.category?.name || 'unknown'}`,
      entityType: 'Request',
      entityId: req.id,
      actionUrl: `/admin/requests/${req.id}`,
    });
  }

  private async findAdminRecipients(orgId: string, preferredRoles: string[]): Promise<string[]> {
    const rolesToTry = preferredRoles.length > 0
      ? preferredRoles
      : ['property_manager', 'hoa_admin'];
    const rows = await this.prisma.userRole.findMany({
      where: {
        organizationId: orgId,
        role: { name: { in: rolesToTry } },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { userId: true },
      take: 50,
    });
    return [...new Set(rows.map((r) => r.userId))];
  }

  async transition(
    orgId: string,
    actor: Actor,
    id: string,
    to: string,
    dto: { notes?: string; resolutionNotes?: string; cancelledReason?: string } = {},
  ) {
    const existing = await this.prisma.request.findFirst({
      where: { id, organizationId: orgId },
      include: { unit: { include: { occupancies: { where: { isActive: true } } } } },
    });
    if (!existing) throw new NotFoundException('Request not found');

    // Resident permissions:
    //   - cancel their own submitted/triaged request
    //   - confirm-and-close a resolved request
    //   - move waiting_resident → in_progress when they reply (handled in addComment)
    // Everything else is admin-side.
    if (isResidentRole(actor.role)) {
      const canSee = await this.canResidentSee(actor, existing);
      if (!canSee) throw new ForbiddenException('Cannot act on this request');
      const ownSubmission = existing.submittedByUserId === actor.userId;
      const isOwnCancel = to === 'cancelled' && ownSubmission && ['submitted', 'triaged', 'waiting_resident'].includes(existing.status);
      const isOwnClose = to === 'closed' && ownSubmission && existing.status === 'resolved';
      if (!isOwnCancel && !isOwnClose) {
        throw new ForbiddenException('Residents may only cancel their open requests or close a resolved one');
      }
    }

    this.assertTransition(existing.status, to);

    const data: any = { status: to };
    const now = new Date();
    if (to === 'triaged') data.triagedAt = now;
    if (to === 'resolved') {
      data.resolvedAt = now;
      if (dto.resolutionNotes) data.resolutionNotes = dto.resolutionNotes;
    }
    if (to === 'closed') data.closedAt = now;
    if (to === 'cancelled') {
      data.cancelledAt = now;
      if (dto.cancelledReason) data.cancelledReason = dto.cancelledReason;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.request.update({
        where: { id },
        data,
        include: { category: true },
      });
      await tx.requestEvent.create({
        data: {
          requestId: id,
          actorId: actor.userId,
          type: 'status_change',
          payload: { from: existing.status, to, notes: dto.notes } as any,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'request_status_change',
          entityType: 'Request',
          entityId: id,
          changes: { from: existing.status, to } as any,
        },
      });
      return u;
    });

    // Webhook + resident notification on resolution.
    if (to === 'resolved') {
      this.webhooks.emit(orgId, 'request.resolved' as any, {
        requestId: id,
        unitId: updated.unitId,
        resolutionNotes: updated.resolutionNotes,
      });
      await this.notifyResidentOnUpdate(orgId, updated, `Request resolved`, dto.resolutionNotes || 'See request for details.');
    } else if (to === 'waiting_resident') {
      await this.notifyResidentOnUpdate(orgId, updated, `Waiting on your reply`, `${updated.subject} is paused pending your response.`);
    }

    return updated;
  }

  /**
   * Assign (or reassign) the request. Optional `assignedToUserId` clears the
   * assignment when null. Auto-transitions submitted → triaged.
   */
  async assign(orgId: string, actor: Actor, id: string, assignedToUserId: string | null) {
    if (isResidentRole(actor.role)) throw new ForbiddenException('Only admins can assign requests');

    const existing = await this.prisma.request.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Request not found');

    if (assignedToUserId) {
      const sharesOrg = await this.prisma.userRole.findFirst({
        where: { userId: assignedToUserId, organizationId: orgId },
      });
      if (!sharesOrg) throw new BadRequestException('Assignee is not a member of this organization');
    }

    return this.prisma.$transaction(async (tx) => {
      const data: any = { assignedToUserId, assignedAt: assignedToUserId ? new Date() : null };
      // Auto-advance state on first assignment.
      if (existing.status === 'submitted' && assignedToUserId) {
        data.status = 'triaged';
        data.triagedAt = new Date();
      }
      const updated = await tx.request.update({
        where: { id },
        data,
        include: { category: true },
      });
      await tx.requestEvent.create({
        data: {
          requestId: id,
          actorId: actor.userId,
          type: 'assigned',
          payload: { from: existing.assignedToUserId, to: assignedToUserId } as any,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'request_assigned',
          entityType: 'Request',
          entityId: id,
          changes: { from: existing.assignedToUserId, to: assignedToUserId } as any,
        },
      });
      // Notify the new assignee.
      if (assignedToUserId && assignedToUserId !== existing.assignedToUserId) {
        await this.notifications.enqueueFor({
          organizationId: orgId,
          recipientUserIds: [assignedToUserId],
          type: 'request_assigned',
          title: `Assigned: ${existing.subject}`,
          body: 'You have been assigned a resident request.',
          entityType: 'Request',
          entityId: id,
          actionUrl: `/admin/requests/${id}`,
        });
      }
      return updated;
    });
  }

  async changePriority(orgId: string, actor: Actor, id: string, priority: string) {
    if (isResidentRole(actor.role)) throw new ForbiddenException('Only admins can change priority');
    if (!ALLOWED_PRIORITIES.includes(priority as any)) {
      throw new BadRequestException(`priority must be one of ${ALLOWED_PRIORITIES.join(', ')}`);
    }
    const existing = await this.prisma.request.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Request not found');
    if (existing.priority === priority) return existing;

    return this.prisma.$transaction(async (tx) => {
      const u = await tx.request.update({ where: { id }, data: { priority } });
      await tx.requestEvent.create({
        data: {
          requestId: id, actorId: actor.userId, type: 'priority_change',
          payload: { from: existing.priority, to: priority } as any,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId, actorId: actor.userId, actorRole: actor.role,
          action: 'request_priority_change', entityType: 'Request', entityId: id,
          changes: { from: existing.priority, to: priority } as any,
        },
      });
      return u;
    });
  }

  // ============ Comments ============

  async addComment(
    orgId: string,
    actor: Actor,
    requestId: string,
    dto: { body: string; isInternal?: boolean; attachments?: AttachmentInput[] },
  ) {
    if (!dto.body || dto.body.length > 8000) {
      throw new BadRequestException('comment body is required (≤8000 chars)');
    }
    const isInternal = !!dto.isInternal;
    if (isInternal && isResidentRole(actor.role)) {
      throw new ForbiddenException('Residents cannot post internal notes');
    }
    this.validateAttachments(dto.attachments);

    const existing = await this.prisma.request.findFirst({
      where: { id: requestId, organizationId: orgId },
      include: { unit: { include: { occupancies: { where: { isActive: true } } } } },
    });
    if (!existing) throw new NotFoundException('Request not found');
    if (isResidentRole(actor.role)) {
      const canSee = await this.canResidentSee(actor, existing);
      if (!canSee) throw new ForbiddenException('Cannot comment on this request');
      if (['closed', 'cancelled'].includes(existing.status)) {
        throw new ConflictException(`Cannot comment on a ${existing.status} request`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const c = await tx.requestComment.create({
        data: {
          requestId,
          authorUserId: actor.userId,
          body: dto.body,
          isInternal,
          attachments: (dto.attachments || []) as any,
        },
      });
      await tx.requestEvent.create({
        data: {
          requestId,
          actorId: actor.userId,
          type: 'comment',
          payload: { commentId: c.id, isInternal } as any,
        },
      });
      // When a resident replies while we were waiting on them, auto-bump.
      if (
        isResidentRole(actor.role) &&
        existing.status === 'waiting_resident' &&
        !isInternal
      ) {
        await tx.request.update({
          where: { id: requestId },
          data: { status: 'in_progress' },
        });
        await tx.requestEvent.create({
          data: {
            requestId, actorId: actor.userId, type: 'status_change',
            payload: { from: 'waiting_resident', to: 'in_progress', reason: 'resident_replied' } as any,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: isInternal ? 'request_internal_note' : 'request_comment',
          entityType: 'Request',
          entityId: requestId,
          changes: { commentId: c.id, isInternal } as any,
        },
      });
      return c;
    });
  }

  // ============ Analytics ============

  async overdueSummary(orgId: string) {
    const [overdueCount, openCount, byPriority] = await Promise.all([
      this.prisma.request.count({
        where: {
          organizationId: orgId,
          dueAt: { lt: new Date() },
          status: { notIn: ['resolved', 'closed', 'cancelled'] },
        },
      }),
      this.prisma.request.count({
        where: {
          organizationId: orgId,
          status: { notIn: ['resolved', 'closed', 'cancelled'] },
        },
      }),
      this.prisma.request.groupBy({
        by: ['priority'],
        where: {
          organizationId: orgId,
          status: { notIn: ['resolved', 'closed', 'cancelled'] },
        },
        _count: { _all: true },
      }),
    ]);
    return {
      overdueCount,
      openCount,
      byPriority: Object.fromEntries(byPriority.map((r) => [r.priority, r._count._all])),
    };
  }

  // ============ Helpers ============

  private assertTransition(from: string, to: string) {
    const allowed = ALLOWED_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      throw new ConflictException(`Cannot transition request from ${from} to ${to}`);
    }
  }

  private validateAttachments(atts: AttachmentInput[] | undefined) {
    if (!atts || atts.length === 0) return;
    if (atts.length > MAX_ATTACHMENTS) {
      throw new BadRequestException(`At most ${MAX_ATTACHMENTS} attachments allowed`);
    }
    for (const a of atts) {
      if (typeof a.url !== 'string' || a.url.length > 2048 || !/^https?:\/\//i.test(a.url)) {
        throw new BadRequestException('Attachment URL must be http(s) and ≤2048 chars');
      }
      if (typeof a.filename !== 'string' || a.filename.length > 200) {
        throw new BadRequestException('Attachment filename required (≤200 chars)');
      }
      if (!ALLOWED_CONTENT_TYPES.has(a.contentType)) {
        throw new BadRequestException(`Attachment content type ${a.contentType} not allowed`);
      }
      if (typeof a.size !== 'number' || a.size < 0 || a.size > 25 * 1024 * 1024) {
        throw new BadRequestException('Attachment size must be 0..25MB');
      }
    }
  }

  private async canResidentSee(actor: Actor, req: any): Promise<boolean> {
    if (req.submittedByUserId === actor.userId) return true;
    if (!req.unitId) return false;
    return actorOccupiesUnit(this.prisma, actor, req.unitId);
  }

  private async notifyResidentOnUpdate(orgId: string, req: any, title: string, body: string) {
    // Tell the submitter and any active resident occupants of the unit.
    const recipients = new Set<string>([req.submittedByUserId]);
    if (req.unitId) {
      const occs = await this.prisma.unitOccupancy.findMany({
        where: { unitId: req.unitId, isActive: true },
        include: { person: { select: { userId: true } } },
      });
      for (const o of occs) if (o.person?.userId) recipients.add(o.person.userId);
    }
    if (recipients.size === 0) return;
    await this.notifications.enqueueFor({
      organizationId: orgId,
      recipientUserIds: [...recipients],
      type: 'request_update',
      title,
      body,
      entityType: 'Request',
      entityId: req.id,
      actionUrl: `/requests/${req.id}`,
    });
  }
}
