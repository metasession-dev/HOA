import {
  Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';
import { Actor, isResidentRole, scopeInvoiceWhere } from '../common/scope.util';
import { nextInvoiceNumber } from '../common/invoice-number';

const CADENCES = ['weekly', 'biweekly', 'monthly'] as const;
type Cadence = typeof CADENCES[number];

const MIN_INSTALLMENTS = 2;
const MAX_INSTALLMENTS = 36;

/**
 * Phase 1.2 payment plans.
 *
 * Consolidate one or more overdue invoices into a fixed series of installments.
 * Each installment generates a child Invoice on its due date so the
 * reconciliation + arrears pipelines stay invariant: a debtor either has
 * unpaid invoices or they don't.
 *
 * Source invoices: when a plan activates, source invoices are marked with
 * status='on_plan' (kept in DB; UI hides them from arrears when filtering).
 * Pre-existing tests + arrears reports treat them as "covered" via the
 * scopeInvoiceWhere helper at query time.
 */
@Injectable()
export class PaymentPlansService {
  constructor(private prisma: PrismaService) {}

  async list(orgId: string, actor: Actor, query: { status?: string; unitId?: string } = {}) {
    const where: any = { organizationId: orgId };
    if (query.status) where.status = query.status;
    if (query.unitId) where.unitId = query.unitId;
    if (isResidentRole(actor.role)) {
      where.unit = {
        occupancies: {
          some: { isActive: true, person: { userId: actor.userId } },
        },
      };
    }
    return this.prisma.paymentPlan.findMany({
      where,
      include: {
        installments: { orderBy: { sequence: 'asc' } },
        _count: { select: { installments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findById(orgId: string, actor: Actor, id: string) {
    const plan = await this.prisma.paymentPlan.findFirst({
      where: { id, organizationId: orgId },
      include: { installments: { orderBy: { sequence: 'asc' }, include: { invoice: true } } },
    });
    if (!plan) throw new NotFoundException('Payment plan not found');
    if (isResidentRole(actor.role)) {
      const occupies = await this.prisma.unitOccupancy.findFirst({
        where: { unitId: plan.unitId, isActive: true, person: { userId: actor.userId } },
      });
      if (!occupies) throw new ForbiddenException('Cannot view this payment plan');
    }
    return plan;
  }

  async create(
    orgId: string,
    actor: Actor,
    dto: {
      unitId: string;
      sourceInvoiceIds: string[];
      installmentCount: number;
      cadence?: string;
      startDate: string;
      notes?: string;
    },
  ) {
    if (isResidentRole(actor.role)) throw new ForbiddenException('Only admins can create payment plans');
    if (!CADENCES.includes((dto.cadence || 'monthly') as Cadence)) {
      throw new BadRequestException(`cadence must be one of ${CADENCES.join(', ')}`);
    }
    if (dto.installmentCount < MIN_INSTALLMENTS || dto.installmentCount > MAX_INSTALLMENTS) {
      throw new BadRequestException(`installmentCount must be ${MIN_INSTALLMENTS}..${MAX_INSTALLMENTS}`);
    }
    if (!Array.isArray(dto.sourceInvoiceIds) || dto.sourceInvoiceIds.length === 0) {
      throw new BadRequestException('sourceInvoiceIds is required (at least one)');
    }

    // Resolve sources + verify ownership + same unit + open status.
    const sources = await this.prisma.invoice.findMany({
      where: {
        id: { in: dto.sourceInvoiceIds },
        organizationId: orgId,
      },
    });
    if (sources.length !== dto.sourceInvoiceIds.length) {
      throw new BadRequestException('One or more source invoices not found in this organization');
    }
    for (const inv of sources) {
      if (inv.unitId !== dto.unitId) {
        throw new BadRequestException(`Invoice ${inv.invoiceNumber} is not against unit ${dto.unitId}`);
      }
      if (['paid', 'voided', 'on_plan'].includes(inv.status)) {
        throw new ConflictException(`Invoice ${inv.invoiceNumber} (${inv.status}) cannot be added to a plan`);
      }
    }

    // Verify no other open plan already consolidates these invoices.
    const openPlans = await this.prisma.paymentPlan.findMany({
      where: { organizationId: orgId, unitId: dto.unitId, status: { in: ['pending', 'active'] } },
    });
    for (const p of openPlans) {
      const existing = (p.sourceInvoiceIds as string[]) || [];
      const overlap = existing.filter((id) => dto.sourceInvoiceIds.includes(id));
      if (overlap.length > 0) {
        throw new ConflictException(`Some invoices are already on plan ${p.id}`);
      }
    }

    // Currency must be consistent across source invoices for the plan total
    // to make sense. Mixed-currency consolidations need product-side
    // disambiguation; refuse until then.
    const currencies = [...new Set(sources.map((s) => s.currency))];
    if (currencies.length > 1) {
      throw new BadRequestException('All source invoices must share a single currency');
    }
    const currency = currencies[0];

    const total = sources.reduce((s, inv) => s.plus(new Decimal(inv.amount.toString())), new Decimal(0));
    const installmentAmount = total.div(dto.installmentCount).toDecimalPlaces(2);
    // The last installment absorbs the rounding drift so the plan total ties
    // back to the consolidated balance exactly.
    const drift = total.minus(installmentAmount.times(dto.installmentCount));
    const installmentAmounts = Array.from({ length: dto.installmentCount }, (_, i) =>
      i === dto.installmentCount - 1 ? installmentAmount.plus(drift) : installmentAmount,
    );

    const startDate = new Date(dto.startDate);
    if (Number.isNaN(startDate.getTime())) throw new BadRequestException('Invalid startDate');

    const cadence = (dto.cadence || 'monthly') as Cadence;

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.paymentPlan.create({
        data: {
          organizationId: orgId,
          unitId: dto.unitId,
          sourceInvoiceIds: dto.sourceInvoiceIds as any,
          totalAmount: total,
          currency,
          installmentCount: dto.installmentCount,
          cadence,
          startDate,
          status: 'pending',
          notes: dto.notes,
          createdBy: actor.userId,
        },
      });

      // Generate installment rows
      for (let i = 0; i < dto.installmentCount; i++) {
        const dueDate = this.addCadence(startDate, cadence, i);
        await tx.paymentPlanInstallment.create({
          data: {
            paymentPlanId: plan.id,
            sequence: i + 1,
            amount: installmentAmounts[i],
            dueDate,
            status: 'pending',
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'payment_plan_created',
          entityType: 'PaymentPlan',
          entityId: plan.id,
          changes: {
            total: total.toString(), currency,
            installmentCount: dto.installmentCount, cadence,
            sourceInvoiceIds: dto.sourceInvoiceIds,
          } as any,
        },
      });
      return plan;
    });
  }

  /**
   * Activate a pending plan: marks source invoices as `on_plan` and flips the
   * plan into `active`. Generates the first installment invoice immediately
   * so the resident sees something they can pay.
   */
  async activate(orgId: string, actor: Actor, id: string) {
    if (isResidentRole(actor.role)) throw new ForbiddenException('Only admins can activate payment plans');
    const plan = await this.prisma.paymentPlan.findFirst({
      where: { id, organizationId: orgId },
      include: { installments: { orderBy: { sequence: 'asc' } } },
    });
    if (!plan) throw new NotFoundException('Payment plan not found');
    if (plan.status !== 'pending') {
      throw new ConflictException(`Cannot activate a ${plan.status} plan`);
    }

    const sourceIds = (plan.sourceInvoiceIds as string[]) || [];

    return this.prisma.$transaction(async (tx) => {
      // CAS-flip: only proceed if still pending.
      const claim = await tx.paymentPlan.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'active' },
      });
      if (claim.count === 0) throw new ConflictException('Plan was modified concurrently');

      // Mark sources as on_plan
      if (sourceIds.length > 0) {
        await tx.invoice.updateMany({
          where: { id: { in: sourceIds }, organizationId: orgId, status: { notIn: ['paid', 'voided'] } },
          data: { status: 'on_plan' },
        });
      }

      // Generate the first installment invoice
      const first = plan.installments[0];
      if (first) {
        await this.materializeInstallmentInvoice(tx as any, orgId, plan, first, actor);
      }

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'payment_plan_activated',
          entityType: 'PaymentPlan',
          entityId: id,
          changes: { sourceInvoiceIds: sourceIds } as any,
        },
      });
      return tx.paymentPlan.findUniqueOrThrow({ where: { id }, include: { installments: { orderBy: { sequence: 'asc' } } } });
    });
  }

  async cancel(orgId: string, actor: Actor, id: string, reason?: string) {
    if (isResidentRole(actor.role)) throw new ForbiddenException('Only admins can cancel payment plans');
    const plan = await this.prisma.paymentPlan.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!plan) throw new NotFoundException('Payment plan not found');
    if (['completed', 'cancelled', 'defaulted'].includes(plan.status)) {
      throw new ConflictException(`Cannot cancel a ${plan.status} plan`);
    }

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.paymentPlan.updateMany({
        where: { id, status: { in: ['pending', 'active'] } },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
      if (claim.count === 0) throw new ConflictException('Plan was modified concurrently');

      // Revert source invoices from `on_plan` back to their prior state. We
      // don't know the *exact* prior state so we set them to `sent`, leaving
      // dueDate intact — this is the safe default; admins can manually void
      // if appropriate.
      const sourceIds = (plan.sourceInvoiceIds as string[]) || [];
      if (sourceIds.length > 0) {
        await tx.invoice.updateMany({
          where: { id: { in: sourceIds }, organizationId: orgId, status: 'on_plan' },
          data: { status: 'sent' },
        });
      }

      // Void any pending installment-generated invoices (kept for audit).
      await tx.invoice.updateMany({
        where: {
          organizationId: orgId,
          paymentPlanInstallment: { paymentPlanId: id },
          status: { in: ['draft', 'sent', 'partial', 'overdue'] },
        },
        data: { status: 'voided' },
      });

      await tx.auditLog.create({
        data: {
          organizationId: orgId, actorId: actor.userId, actorRole: actor.role,
          action: 'payment_plan_cancelled', entityType: 'PaymentPlan', entityId: id,
          changes: { reason } as any,
        },
      });

      return tx.paymentPlan.findUniqueOrThrow({
        where: { id },
        include: { installments: { orderBy: { sequence: 'asc' } } },
      });
    });
  }

  /**
   * Cron-callable: walk active plans, generate any due-but-not-yet-invoiced
   * installments, and flip overdue ones. Idempotent — installments already in
   * `invoiced` skip.
   */
  async materializeDueInstallments(orgId: string, actor: Actor) {
    const dueInstallments = await this.prisma.paymentPlanInstallment.findMany({
      where: {
        status: 'pending',
        dueDate: { lte: new Date() },
        paymentPlan: { organizationId: orgId, status: 'active' },
      },
      include: { paymentPlan: true },
      take: 500,
    });
    let created = 0;
    for (const inst of dueInstallments) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.materializeInstallmentInvoice(tx as any, orgId, inst.paymentPlan, inst, actor);
        });
        created++;
      } catch {
        /* skip individual failures */
      }
    }
    return { generated: created };
  }

  /**
   * Mark installment + corresponding source invoices paid when the
   * generated invoice gets paid. Called from the Payments service on
   * payment.received for invoices linked to a plan installment.
   */
  async onInstallmentInvoicePaid(invoiceId: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        paymentPlanInstallment: { include: { paymentPlan: { include: { installments: true } } } },
      },
    });
    if (!inv?.paymentPlanInstallment) return;
    const installment = inv.paymentPlanInstallment;
    const plan = installment.paymentPlan;

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentPlanInstallment.update({
        where: { id: installment.id },
        data: { status: 'paid', paidAt: new Date() },
      });
      // Plan completion check
      const remaining = await tx.paymentPlanInstallment.count({
        where: { paymentPlanId: plan.id, status: { notIn: ['paid'] } },
      });
      if (remaining === 0) {
        await tx.paymentPlan.update({
          where: { id: plan.id },
          data: { status: 'completed', completedAt: new Date() },
        });
        // Mark source invoices as paid (the resident did pay — through the plan).
        const sourceIds = (plan.sourceInvoiceIds as string[]) || [];
        if (sourceIds.length > 0) {
          await tx.invoice.updateMany({
            where: { id: { in: sourceIds }, status: 'on_plan' },
            data: { status: 'paid', paidAt: new Date() },
          });
        }
      }
    });
  }

  // ============ Helpers ============

  private addCadence(start: Date, cadence: Cadence, i: number): Date {
    const d = new Date(start);
    if (cadence === 'weekly') d.setUTCDate(d.getUTCDate() + 7 * i);
    else if (cadence === 'biweekly') d.setUTCDate(d.getUTCDate() + 14 * i);
    else d.setUTCMonth(d.getUTCMonth() + i);
    return d;
  }

  private async materializeInstallmentInvoice(tx: any, orgId: string, plan: any, installment: any, actor: Actor) {
    if (installment.status !== 'pending') return;
    const invoiceNumber = await nextInvoiceNumber(tx, orgId);
    const dueDate = new Date(installment.dueDate);
    const inv = await tx.invoice.create({
      data: {
        organizationId: orgId,
        unitId: plan.unitId,
        invoiceNumber,
        type: 'payment_plan',
        amount: installment.amount,
        originalAmount: installment.amount,
        currency: plan.currency,
        dueDate,
        status: 'sent',
        sentAt: new Date(),
        lineItems: [{ description: `Payment plan installment ${installment.sequence} of ${plan.installmentCount}`, amount: Number(installment.amount.toString()) }],
        notes: `Auto-generated from payment plan ${plan.id}`,
        createdBy: actor.userId,
        paymentPlanInstallmentId: installment.id,
      },
    });
    await tx.paymentPlanInstallment.update({
      where: { id: installment.id },
      data: { status: 'invoiced', invoicedAt: new Date() },
    });
    return inv;
  }
}
