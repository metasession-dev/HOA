import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalRulesService } from './approval-rules.service';
import {
  CreateVendorInvoiceDto,
  UpdateVendorInvoiceDto,
  DecideApprovalDto,
  RejectInvoiceDto,
  PayInvoiceDto,
  BatchPayDto,
} from './dto/vendors.dto';

export type Actor = { userId: string; role: string };

/**
 * Vendor invoice state machine:
 *   captured → pending_approval → approved → paid
 *                                ↘ rejected
 *   captured → cancelled
 *   pending_approval → cancelled
 *   rejected → cancelled
 */
const ALLOWED: Record<string, string[]> = {
  captured: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'rejected', 'cancelled'],
  approved: ['paid', 'cancelled'],
  rejected: ['cancelled'],
  paid: [],
  cancelled: [],
};

@Injectable()
export class VendorInvoicesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private rules: ApprovalRulesService,
  ) {}

  async list(
    orgId: string,
    query: {
      status?: string;
      vendorId?: string;
      from?: string;
      to?: string;
      search?: string;
      mineToApprove?: string;
      actorUserId?: string;
      actorRole?: string;
    },
  ) {
    const where: Prisma.VendorInvoiceWhereInput = { organizationId: orgId };
    if (query.status) where.status = query.status;
    if (query.vendorId) where.vendorId = query.vendorId;
    if (query.from || query.to) {
      where.issueDate = {};
      if (query.from) where.issueDate.gte = new Date(query.from);
      if (query.to) where.issueDate.lte = new Date(query.to);
    }
    if (query.search) {
      where.OR = [
        { vendorInvoiceNo: { contains: query.search, mode: 'insensitive' } },
        { vendor: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.mineToApprove === 'true' && query.actorUserId && query.actorRole) {
      where.status = 'pending_approval';
      where.approvals = {
        some: {
          decision: 'pending',
          requiredRole: query.actorRole,
        },
      };
    }
    return this.prisma.vendorInvoice.findMany({
      where,
      include: {
        vendor: { select: { id: true, name: true, status: true } },
        approvals: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, orgId: string) {
    const inv = await this.prisma.vendorInvoice.findFirst({
      where: { id, organizationId: orgId },
      include: {
        vendor: true,
        glAccount: { select: { id: true, code: true, name: true } },
        approvals: { orderBy: [{ sequenceIndex: 'asc' }, { createdAt: 'asc' }] },
        events: { orderBy: { createdAt: 'desc' }, take: 50 },
        duplicateOf: { select: { id: true, vendorInvoiceNo: true, status: true } },
      },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  async create(orgId: string, actor: Actor, dto: CreateVendorInvoiceDto) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: dto.vendorId, organizationId: orgId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (vendor.status === 'blacklisted') {
      throw new ConflictException('Cannot capture an invoice for a blacklisted vendor');
    }
    if (vendor.status === 'suspended') {
      throw new ConflictException('Vendor is suspended. Reactivate before capturing invoices.');
    }

    const currency = dto.currency ?? vendor.preferredCurrency ?? 'ZAR';
    if (
      currency !== vendor.preferredCurrency &&
      !dto.currencyOverride
    ) {
      throw new BadRequestException(
        `Currency ${currency} differs from vendor's preferred currency ${vendor.preferredCurrency}. Set currencyOverride=true to proceed.`,
      );
    }

    if (dto.glAccountId) {
      const gl = await this.prisma.gLAccount.findFirst({
        where: { id: dto.glAccountId, organizationId: orgId, isActive: true },
      });
      if (!gl) throw new BadRequestException('Invalid GL account');
    }

    // Sanitize line-item totals: each total ≈ qty × unitPrice (rounding tolerance 0.01)
    if (dto.lineItems) {
      for (const li of dto.lineItems) {
        const expected = Math.round(li.quantity * li.unitPrice * 100) / 100;
        if (Math.abs(expected - li.total) > 0.01) {
          throw new BadRequestException(
            `Line "${li.description}": total ${li.total} doesn't match qty × unitPrice (${expected})`,
          );
        }
      }
    }

    if (dto.attachments && dto.attachments.length > 10) {
      throw new BadRequestException('Maximum 10 attachments per invoice');
    }

    // Auto-generate an internal reference when the user didn't enter the
    // supplier's invoice number. Format: VINV-YYYY-NNNNN, year-scoped per-org.
    // Race-safe enough for the expected volume — collisions are caught by the
    // @@unique([organizationId, vendorId, vendorInvoiceNo]) constraint and a
    // single retry with a freshly-computed suffix would handle the (rare)
    // concurrent-submit case. We don't bother with that retry today; the
    // unique constraint just surfaces as a clear 409.
    let vendorInvoiceNo = (dto.vendorInvoiceNo ?? '').trim();
    const autoGenerated = !vendorInvoiceNo;
    if (autoGenerated) {
      const year = new Date(dto.issueDate).getUTCFullYear();
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
      const count = await this.prisma.vendorInvoice.count({
        where: {
          organizationId: orgId,
          issueDate: { gte: yearStart, lt: yearEnd },
        },
      });
      vendorInvoiceNo = `VINV-${year}-${String(count + 1).padStart(5, '0')}`;
    }

    // Duplicate detection runs only for user-supplied numbers — auto-generated
    // ones are sequential and cannot collide with the user's intent.
    const dup = autoGenerated
      ? null
      : await this.prisma.vendorInvoice.findFirst({
          where: {
            organizationId: orgId,
            vendorId: dto.vendorId,
            vendorInvoiceNo,
          },
        });
    if (dup && !dto.overrideDuplicate) {
      throw new ConflictException({
        message: `Duplicate invoice: vendor ${vendor.name} already has invoice ${vendorInvoiceNo}`,
        duplicateOfId: dup.id,
      });
    }

    const glAccountId = dto.glAccountId ?? vendor.defaultGlAccountId ?? undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.vendorInvoice.create({
        data: {
          organizationId: orgId,
          vendorId: dto.vendorId,
          vendorInvoiceNo: vendorInvoiceNo + (dup ? `-DUP-${Date.now().toString(36)}` : ''),
          amount: new Decimal(dto.amount),
          currency,
          vatAmount: dto.vatAmount !== undefined ? new Decimal(dto.vatAmount) : undefined,
          issueDate: new Date(dto.issueDate),
          dueDate: new Date(dto.dueDate),
          glAccountId,
          lineItems: (dto.lineItems ?? []) as unknown as Prisma.InputJsonValue,
          attachments: (dto.attachments ?? []) as unknown as Prisma.InputJsonValue,
          notes: dto.notes,
          capturedBy: actor.userId,
          duplicateOfId: dup ? dup.id : null,
          status: 'captured',
        },
      });

      await tx.vendorInvoiceEvent.create({
        data: {
          vendorInvoiceId: inv.id,
          type: 'status_change',
          actorId: actor.userId,
          payload: { to: 'captured', amount: dto.amount, currency } as any,
        },
      });

      // Select approval rule + create pending Approval rows + transition to pending_approval
      const rule = await this.rules.selectFor(
        orgId,
        { amount: dto.amount, currency, glAccountId },
        tx,
      );

      if (!rule) {
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorId: actor.userId,
            actorRole: actor.role,
            action: 'captured_no_rule',
            entityType: 'VendorInvoice',
            entityId: inv.id,
            changes: { amount: dto.amount, currency } as any,
          },
        });
        // Without a matching rule, keep in 'captured' so admins can fix rules then advance.
        return inv;
      }

      const approvalRows = rule.requiredRoles.map((role, idx) => ({
        vendorInvoiceId: inv.id,
        requiredRole: role,
        ruleId: rule.id,
        sequenceIndex: rule.mode === 'sequential' ? idx : 0,
        decision: 'pending' as const,
      }));
      await tx.approval.createMany({ data: approvalRows });

      const updated = await tx.vendorInvoice.update({
        where: { id: inv.id },
        data: { status: 'pending_approval' },
      });

      await tx.vendorInvoiceEvent.create({
        data: {
          vendorInvoiceId: inv.id,
          type: 'status_change',
          actorId: actor.userId,
          payload: { to: 'pending_approval', ruleId: rule.id, ruleName: rule.name } as any,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'captured',
          entityType: 'VendorInvoice',
          entityId: inv.id,
          changes: { amount: dto.amount, currency, ruleId: rule.id } as any,
        },
      });

      // Notify approvers
      const approvers = await tx.userRole.findMany({
        where: {
          organizationId: orgId,
          role: { name: { in: rule.requiredRoles } },
          userId: { not: actor.userId },
        },
        select: { userId: true },
      });
      const recipientUserIds = Array.from(new Set(approvers.map((u) => u.userId)));
      if (recipientUserIds.length > 0) {
        await tx.notification.createMany({
          data: recipientUserIds.map((uid) => ({
            organizationId: orgId,
            recipientUserId: uid,
            type: 'approval_needed',
            title: `Invoice approval needed: ${vendor.name}`,
            body: `${currency} ${dto.amount} from ${vendor.name} (${inv.vendorInvoiceNo}) needs your approval.`,
            entityType: 'VendorInvoice',
            entityId: inv.id,
            actionUrl: `/payables/${inv.id}`,
          })),
          skipDuplicates: true,
        });
      }

      return updated;
    });

    // Acknowledge receipt to the vendor (best-effort; vendors have no account).
    if (vendor.email) {
      const amt = `${currency} ${Number(dto.amount).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      await this.notifications.emailExternal({
        organizationId: orgId,
        to: vendor.email,
        recipientName: vendor.name,
        subject: `We've recorded your invoice ${result.vendorInvoiceNo}`,
        message: `Hi ${vendor.name},\n\nWe've recorded your invoice ${result.vendorInvoiceNo} for ${amt}. It's now in our approval queue and we'll be in touch about payment.\n\nThank you.`,
        entityType: 'VendorInvoice',
        entityId: `${result.id}:captured`,
      });
    }
    return result;
  }

  async update(id: string, orgId: string, actor: Actor, dto: UpdateVendorInvoiceDto) {
    const existing = await this.findById(id, orgId);
    if (existing.status !== 'captured') {
      throw new ConflictException('Invoice can only be edited while status=captured');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.vendorInvoice.update({
        where: { id },
        data: {
          vendorInvoiceNo: dto.vendorInvoiceNo,
          amount: dto.amount !== undefined ? new Decimal(dto.amount) : undefined,
          currency: dto.currency,
          vatAmount: dto.vatAmount !== undefined ? new Decimal(dto.vatAmount) : undefined,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          glAccountId: dto.glAccountId,
          lineItems: dto.lineItems ? (dto.lineItems as unknown as Prisma.InputJsonValue) : undefined,
          attachments: dto.attachments ? (dto.attachments as unknown as Prisma.InputJsonValue) : undefined,
          notes: dto.notes,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'updated',
          entityType: 'VendorInvoice',
          entityId: inv.id,
          changes: { before: existing, after: inv } as any,
        },
      });
      return inv;
    });
    return updated;
  }

  async approve(id: string, orgId: string, actor: Actor, dto: DecideApprovalDto) {
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.vendorInvoice.findFirst({
        where: { id, organizationId: orgId },
        include: { approvals: { orderBy: [{ sequenceIndex: 'asc' }, { createdAt: 'asc' }] }, vendor: true },
      });
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.status !== 'pending_approval') {
        throw new ConflictException(`Cannot approve invoice in status ${inv.status}`);
      }
      if (inv.capturedBy === actor.userId) {
        throw new ForbiddenException('You cannot approve an invoice you captured');
      }

      const pending = inv.approvals.filter((a) => a.decision === 'pending');
      if (pending.length === 0) throw new ConflictException('No pending approvals on this invoice');

      // For sequential mode: only the lowest-sequenceIndex pending row can be approved.
      const allRows = inv.approvals;
      const rule = await tx.approvalRule.findUnique({ where: { id: pending[0].ruleId } });
      if (rule?.mode === 'sequential') {
        const next = allRows.find((a) => a.decision === 'pending');
        if (next && next.requiredRole !== actor.role) {
          throw new ForbiddenException(
            `Sequential approval: ${next.requiredRole} must decide before ${actor.role}`,
          );
        }
      }

      // Find a slot this actor can fill (role + still pending).
      const slot = pending.find(
        (a) =>
          a.requiredRole === actor.role &&
          a.approverUserId == null,
      );
      if (!slot) {
        throw new ForbiddenException(
          `Your role (${actor.role}) is not required, already filled, or all slots taken`,
        );
      }

      // Prevent the same user approving twice
      const sameUserAlready = allRows.find(
        (a) => a.approverUserId === actor.userId && a.decision !== 'pending',
      );
      if (sameUserAlready) {
        throw new ConflictException('You have already decided on this invoice');
      }

      await tx.approval.update({
        where: { id: slot.id },
        data: {
          approverUserId: actor.userId,
          decision: 'approved',
          decidedAt: new Date(),
          notes: dto.notes,
        },
      });

      await tx.vendorInvoiceEvent.create({
        data: {
          vendorInvoiceId: id,
          type: 'approval_decision',
          actorId: actor.userId,
          payload: { decision: 'approved', role: actor.role, ruleId: slot.ruleId } as any,
        },
      });

      // Has the invoice cleared its rule?
      const refreshed = await tx.approval.findMany({
        where: { vendorInvoiceId: id },
      });
      const isApproved = this.computeApprovalOutcome(refreshed, rule);

      let finalStatus = inv.status;
      if (isApproved === 'approved') {
        await tx.vendorInvoice.update({
          where: { id },
          data: { status: 'approved', approvedAt: new Date() },
        });
        finalStatus = 'approved';
        await tx.vendorInvoiceEvent.create({
          data: {
            vendorInvoiceId: id,
            type: 'status_change',
            actorId: actor.userId,
            payload: { to: 'approved' } as any,
          },
        });

        // Notify capturer
        await tx.notification.create({
          data: {
            organizationId: orgId,
            recipientUserId: inv.capturedBy,
            type: 'invoice_approved',
            title: `Invoice approved: ${inv.vendor.name}`,
            body: `${inv.currency} ${inv.amount} (${inv.vendorInvoiceNo}) is ready to pay.`,
            entityType: 'VendorInvoice',
            entityId: id,
            actionUrl: `/payables/${id}`,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'approved',
          entityType: 'VendorInvoice',
          entityId: id,
          changes: { approvalId: slot.id, finalStatus } as any,
        },
      });

      return tx.vendorInvoice.findUniqueOrThrow({
        where: { id },
        include: { approvals: true, vendor: true },
      });
    });
  }

  async reject(id: string, orgId: string, actor: Actor, dto: RejectInvoiceDto) {
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.vendorInvoice.findFirst({
        where: { id, organizationId: orgId },
        include: { approvals: true, vendor: true },
      });
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.status !== 'pending_approval') {
        throw new ConflictException(`Cannot reject invoice in status ${inv.status}`);
      }
      if (inv.capturedBy === actor.userId) {
        throw new ForbiddenException('You cannot reject an invoice you captured');
      }

      const slot = inv.approvals.find(
        (a) =>
          a.decision === 'pending' &&
          a.requiredRole === actor.role &&
          a.approverUserId == null,
      );
      if (!slot) {
        throw new ForbiddenException(
          `Your role (${actor.role}) is not currently allowed to reject this invoice`,
        );
      }

      await tx.approval.update({
        where: { id: slot.id },
        data: {
          approverUserId: actor.userId,
          decision: 'rejected',
          decidedAt: new Date(),
          notes: dto.reason,
        },
      });

      await tx.vendorInvoice.update({
        where: { id },
        data: { status: 'rejected', rejectedAt: new Date(), rejectedReason: dto.reason },
      });

      await tx.vendorInvoiceEvent.createMany({
        data: [
          {
            vendorInvoiceId: id,
            type: 'approval_decision',
            actorId: actor.userId,
            payload: { decision: 'rejected', role: actor.role, reason: dto.reason } as any,
          },
          {
            vendorInvoiceId: id,
            type: 'status_change',
            actorId: actor.userId,
            payload: { to: 'rejected', reason: dto.reason } as any,
          },
        ],
      });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'rejected',
          entityType: 'VendorInvoice',
          entityId: id,
          changes: { reason: dto.reason } as any,
        },
      });

      await tx.notification.create({
        data: {
          organizationId: orgId,
          recipientUserId: inv.capturedBy,
          type: 'invoice_rejected',
          title: `Invoice rejected: ${inv.vendor.name}`,
          body: `${inv.vendorInvoiceNo} was rejected. Reason: ${dto.reason}`,
          entityType: 'VendorInvoice',
          entityId: id,
          actionUrl: `/payables/${id}`,
        },
      });

      return tx.vendorInvoice.findUniqueOrThrow({
        where: { id },
        include: { approvals: true, vendor: true },
      });
    });
  }

  async pay(id: string, orgId: string, actor: Actor, dto: PayInvoiceDto) {
    let vendorContact: { email: string | null; name: string } | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.vendorInvoice.findFirst({
        where: { id, organizationId: orgId },
        include: { vendor: true },
      });
      if (!inv) throw new NotFoundException('Invoice not found');
      if (!ALLOWED[inv.status]?.includes('paid')) {
        throw new ConflictException(`Cannot pay invoice in status ${inv.status}`);
      }
      vendorContact = { email: inv.vendor.email, name: inv.vendor.name };

      const paid = await tx.vendorInvoice.update({
        where: { id },
        data: {
          status: 'paid',
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          paymentReference: dto.paymentReference,
        },
      });

      await tx.vendorInvoiceEvent.create({
        data: {
          vendorInvoiceId: id,
          type: 'status_change',
          actorId: actor.userId,
          payload: { to: 'paid', paymentReference: dto.paymentReference } as any,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'paid',
          entityType: 'VendorInvoice',
          entityId: id,
          changes: { paymentReference: dto.paymentReference, amount: inv.amount } as any,
        },
      });

      await tx.notification.create({
        data: {
          organizationId: orgId,
          recipientUserId: inv.capturedBy,
          type: 'invoice_paid',
          title: `Payment recorded: ${inv.vendor.name}`,
          body: `${inv.currency} ${inv.amount} (${inv.vendorInvoiceNo}) marked as paid. Ref: ${dto.paymentReference}`,
          entityType: 'VendorInvoice',
          entityId: id,
          actionUrl: `/payables/${id}`,
        },
      });

      return paid;
    });

    // Payment confirmation to the vendor (best-effort).
    const vc = vendorContact as { email: string | null; name: string } | null;
    if (vc?.email) {
      const amt = `${result.currency} ${Number(result.amount.toString()).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      await this.notifications.emailExternal({
        organizationId: orgId,
        to: vc.email,
        recipientName: vc.name,
        subject: `Payment recorded for invoice ${result.vendorInvoiceNo}`,
        message: `Hi ${vc.name},\n\nA payment of ${amt} for invoice ${result.vendorInvoiceNo} has been recorded${dto.paymentReference ? `, reference ${dto.paymentReference}` : ''}.\n\nThank you.`,
        entityType: 'VendorInvoice',
        entityId: `${result.id}:paid`,
      });
    }
    return result;
  }

  async batchPay(orgId: string, actor: Actor, dto: BatchPayDto) {
    if (dto.invoiceIds.length === 0) throw new BadRequestException('No invoices selected');
    if (dto.invoiceIds.length > 50) throw new BadRequestException('Batch limited to 50 invoices');

    const results: Array<{ id: string; ok: boolean; error?: string; paymentReference?: string }> = [];
    for (let i = 0; i < dto.invoiceIds.length; i++) {
      const invId = dto.invoiceIds[i];
      const ref = `${dto.paymentReferencePrefix}-${String(i + 1).padStart(3, '0')}`;
      try {
        await this.pay(invId, orgId, actor, { paymentReference: ref });
        results.push({ id: invId, ok: true, paymentReference: ref });
      } catch (err: any) {
        results.push({ id: invId, ok: false, error: err.message });
      }
    }
    return { totalProcessed: results.length, succeeded: results.filter((r) => r.ok).length, results };
  }

  async cancel(id: string, orgId: string, actor: Actor, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.vendorInvoice.findFirst({
        where: { id, organizationId: orgId },
      });
      if (!inv) throw new NotFoundException('Invoice not found');
      if (!ALLOWED[inv.status]?.includes('cancelled')) {
        throw new ConflictException(`Cannot cancel invoice in status ${inv.status}`);
      }
      const updated = await tx.vendorInvoice.update({
        where: { id },
        data: { status: 'cancelled', notes: `${inv.notes ?? ''}\nCancelled: ${reason}`.trim() },
      });
      await tx.vendorInvoiceEvent.create({
        data: {
          vendorInvoiceId: id,
          type: 'status_change',
          actorId: actor.userId,
          payload: { to: 'cancelled', reason } as any,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'cancelled',
          entityType: 'VendorInvoice',
          entityId: id,
          changes: { reason } as any,
        },
      });
      return updated;
    });
  }

  /** Aging report grouped by vendor */
  async agingReport(orgId: string) {
    const invoices = await this.prisma.vendorInvoice.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['pending_approval', 'approved'] },
      },
      include: { vendor: { select: { id: true, name: true } } },
    });
    const now = Date.now();
    const buckets = (overdueDays: number) => {
      if (overdueDays <= 0) return 'current';
      if (overdueDays <= 30) return '1-30';
      if (overdueDays <= 60) return '31-60';
      if (overdueDays <= 90) return '61-90';
      return '90+';
    };
    const out: Record<string, any> = {};
    for (const inv of invoices) {
      const days = Math.floor((now - new Date(inv.dueDate).getTime()) / 86400000);
      const b = buckets(days);
      const key = inv.vendor.id;
      out[key] ??= { vendorId: key, vendorName: inv.vendor.name, total: 0, buckets: { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 } };
      const amt = Number(inv.amount.toString());
      out[key].total += amt;
      out[key].buckets[b] += amt;
    }
    return Object.values(out).sort((a: any, b: any) => b.total - a.total);
  }

  private computeApprovalOutcome(
    approvals: Array<{ decision: string; sequenceIndex: number; ruleId: string }>,
    rule: { mode: string; approverCount: number } | null,
  ): 'approved' | 'pending' | 'rejected' {
    if (approvals.some((a) => a.decision === 'rejected')) return 'rejected';
    if (!rule) {
      return approvals.every((a) => a.decision === 'approved') ? 'approved' : 'pending';
    }
    const approvedCount = approvals.filter((a) => a.decision === 'approved').length;
    if (rule.mode === 'all') {
      return approvedCount === approvals.length ? 'approved' : 'pending';
    }
    if (rule.mode === 'sequential') {
      // All in order need approved
      return approvedCount === approvals.length ? 'approved' : 'pending';
    }
    // 'any'
    return approvedCount >= rule.approverCount ? 'approved' : 'pending';
  }
}
