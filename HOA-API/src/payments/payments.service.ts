import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaginationDto, paginatedResponse } from '../common/dto';
import { Decimal } from '@prisma/client/runtime/library';
import { Actor, scopePaymentWhere } from '../common/scope.util';
import { WebhooksService } from '../platform/webhooks.service';
import { PaymentPlansService } from '../billing/payment-plans.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';

const ENTERPRISE_BASE = (
  process.env.APP_ENTERPRISE_URL || process.env.ENTERPRISE_BASE_URL || 'http://localhost:3005'
).replace(/\/$/, '');

@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private webhooks: WebhooksService,
    private paymentPlans: PaymentPlansService,
    private mail: MailService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Phase 4 one-time, idempotent ledger backfill. Runs at boot BEFORE the app
   * serves traffic, so the new reconciliation (which reads Invoice.amountPaid)
   * and the per-org invoice sequence are correct on the first request. Safe to
   * re-run: it only touches legacy rows that haven't been migrated yet.
   */
  async onModuleInit() {
    try {
      await this.backfillLedger();
    } catch (err: any) {
      this.logger.error(`Ledger backfill failed (non-fatal): ${err?.message}`);
    }
  }

  async backfillLedger(): Promise<{ orgsSeeded: number; allocationsCreated: number; invoicesRecomputed: number }> {
    let orgsSeeded = 0;
    let allocationsCreated = 0;
    const touchedInvoices = new Set<string>();

    // (a) Seed each org's invoice sequence to its current invoice count so the
    //     new INV-##### numbering continues above the existing numbers.
    const orgsNeedingSeq = await this.prisma.organization.findMany({ where: { invoiceSeq: 0 }, select: { id: true } });
    for (const o of orgsNeedingSeq) {
      const count = await this.prisma.invoice.count({ where: { organizationId: o.id } });
      if (count > 0) {
        await this.prisma.organization.update({ where: { id: o.id }, data: { invoiceSeq: count } });
        orgsSeeded += 1;
      }
    }

    // (b) Create one allocation per legacy completed payment + backfill its org,
    //     in batches until none remain. Idempotent: only payments with no
    //     allocation are selected.
    for (let iter = 0; iter < 200; iter += 1) {
      const legacy = await this.prisma.payment.findMany({
        where: { status: 'completed', invoiceId: { not: null }, allocations: { none: {} } },
        select: { id: true, invoiceId: true, amount: true, organizationId: true, invoice: { select: { organizationId: true } } },
        take: 1000,
      });
      if (legacy.length === 0) break;
      for (const p of legacy) {
        const orgId = p.organizationId || p.invoice?.organizationId || null;
        try {
          await this.prisma.$transaction(async (tx) => {
            await tx.paymentAllocation.create({ data: { paymentId: p.id, invoiceId: p.invoiceId!, amount: p.amount } });
            if (!p.organizationId && orgId) {
              await tx.payment.update({ where: { id: p.id }, data: { organizationId: orgId } });
            }
          });
          allocationsCreated += 1;
          touchedInvoices.add(p.invoiceId!);
        } catch (err: any) {
          this.logger.warn(`Backfill skipped payment ${p.id}: ${err?.message}`);
        }
      }
    }

    // (c) Recompute amountPaid from the ledger for every touched invoice.
    for (const invId of touchedInvoices) {
      const agg = await this.prisma.paymentAllocation.aggregate({ where: { invoiceId: invId }, _sum: { amount: true } });
      await this.prisma.invoice.update({ where: { id: invId }, data: { amountPaid: agg._sum.amount ?? new Decimal(0) } });
    }

    if (orgsSeeded || allocationsCreated) {
      this.logger.log(`Ledger backfill: seeded ${orgsSeeded} org sequence(s), created ${allocationsCreated} allocation(s), recomputed ${touchedInvoices.size} invoice(s).`);
    }
    return { orgsSeeded, allocationsCreated, invoicesRecomputed: touchedInvoices.size };
  }

  async findAll(orgId: string, query: PaginationDto, actor?: Actor) {
    const { page = 1, limit = 20 } = query;
    let where: any = { invoice: { organizationId: orgId } };
    if (actor) where = scopePaymentWhere(where, actor);

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: { invoice: { include: { unit: { include: { estate: true } } } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return paginatedResponse(data, total, page, limit);
  }

  /**
   * Phase 4: exactly-once, transactional payment reconciliation through the
   * allocation ledger.
   *
   *  - Locks the target invoice row (SELECT … FOR UPDATE) for the transaction,
   *    so concurrent payments on the same invoice can't race.
   *  - Idempotent on (organizationId, method, processorReference): a webhook
   *    retry (or a re-driven logPayment after a crash) finds the existing
   *    receipt and returns it WITHOUT crediting again.
   *  - Allocates min(amount, outstanding) to the invoice via PaymentAllocation,
   *    bumps the server-authoritative `amountPaid` cache, and parks any surplus
   *    as `amountUnallocated` (overpayment / credit).
   *  - Side-effects (plan progression, webhook fanout, emails, notifications)
   *    fire AFTER commit, and only on first processing.
   */
  async logPayment(data: { invoiceId: string; amount: number; method: string; processorReference?: string }, userId: string) {
    const reference = data.processorReference || `MOCK-${Date.now()}`;

    const result = await this.prisma.$transaction(async (tx) => {
      // Acquire the row lock, then read the locked row through the typed client.
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${data.invoiceId} FOR UPDATE`;
      const invoice = await tx.invoice.findUnique({
        where: { id: data.invoiceId },
        include: { unit: { select: { unitNumber: true } } },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');

      // Idempotency: same (org, method, reference) already settled → no-op.
      const existing = await tx.payment.findUnique({
        where: {
          organizationId_method_processorReference: {
            organizationId: invoice.organizationId,
            method: data.method,
            processorReference: reference,
          },
        },
      });
      if (existing) {
        return { payment: existing, invoice, newStatus: invoice.status, applied: new Decimal(0), alreadyProcessed: true };
      }

      const amount = new Decimal(data.amount);
      const invAmount = new Decimal(invoice.amount.toString());
      const alreadyPaid = new Decimal(invoice.amountPaid.toString());
      const outstanding = Decimal.max(invAmount.minus(alreadyPaid), new Decimal(0));
      const applied = Decimal.min(amount, outstanding);
      const surplus = amount.minus(applied);

      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          organizationId: invoice.organizationId,
          amount,
          amountUnallocated: surplus,
          currency: invoice.currency,
          method: data.method,
          processorReference: reference,
          status: 'completed',
          processedAt: new Date(),
          loggedBy: userId,
        },
      });

      let newStatus = invoice.status;
      if (applied.greaterThan(0)) {
        await tx.paymentAllocation.create({ data: { paymentId: payment.id, invoiceId: invoice.id, amount: applied } });
        const newPaid = alreadyPaid.plus(applied);
        newStatus = newPaid.greaterThanOrEqualTo(invAmount) ? 'paid' : 'partial';
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { amountPaid: newPaid, status: newStatus, paidAt: newStatus === 'paid' ? new Date() : invoice.paidAt },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: invoice.organizationId,
          actorId: userId,
          actorRole: 'system',
          action: 'payment_allocated',
          entityType: 'Invoice',
          entityId: invoice.id,
          changes: { paymentId: payment.id, amount: amount.toString(), applied: applied.toString(), surplus: surplus.toString(), newStatus } as any,
        },
      });

      return { payment, invoice, newStatus, applied, alreadyProcessed: false };
    });

    // Post-commit side-effects — only on first processing.
    if (!result.alreadyProcessed) {
      this.firePaymentSideEffects(result.invoice, result.payment, result.newStatus);
    }
    return result.payment;
  }

  /**
   * Phase 5: settle ONE payment across MANY invoices (resident prepay checkout).
   * Same integrity guarantees as logPayment — locked, idempotent on the receipt
   * unique — but allocates the lump sum oldest-invoice-first across the set.
   */
  async logAllocatedPayment(
    data: { organizationId: string; invoiceIds: string[]; amount: number; method: string; processorReference?: string; currency: string },
    userId: string,
  ) {
    const reference = data.processorReference || `MOCK-${Date.now()}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: {
          organizationId_method_processorReference: {
            organizationId: data.organizationId, method: data.method, processorReference: reference,
          },
        },
      });
      if (existing) return { payment: existing, invoices: [] as any[], paidInvoices: [] as any[], alreadyProcessed: true };

      // Lock every target invoice row for the duration of the transaction.
      for (const id of data.invoiceIds) {
        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id} FOR UPDATE`;
      }
      const invoices = await tx.invoice.findMany({
        where: { id: { in: data.invoiceIds }, organizationId: data.organizationId },
        orderBy: { dueDate: 'asc' },
        include: { unit: { select: { unitNumber: true } } },
      });

      const payment = await tx.payment.create({
        data: {
          invoiceId: invoices[0]?.id ?? null,
          organizationId: data.organizationId,
          amount: new Decimal(data.amount),
          currency: data.currency,
          method: data.method,
          processorReference: reference,
          status: 'completed',
          processedAt: new Date(),
          loggedBy: userId,
        },
      });

      let remaining = new Decimal(data.amount);
      const paidInvoices: any[] = [];
      for (const inv of invoices) {
        if (remaining.lessThanOrEqualTo(0)) break;
        const outstanding = Decimal.max(new Decimal(inv.amount.toString()).minus(new Decimal(inv.amountPaid.toString())), new Decimal(0));
        const applied = Decimal.min(remaining, outstanding);
        if (applied.lessThanOrEqualTo(0)) continue;
        await tx.paymentAllocation.create({ data: { paymentId: payment.id, invoiceId: inv.id, amount: applied } });
        const newPaid = new Decimal(inv.amountPaid.toString()).plus(applied);
        const newStatus = newPaid.greaterThanOrEqualTo(new Decimal(inv.amount.toString())) ? 'paid' : 'partial';
        await tx.invoice.update({
          where: { id: inv.id },
          data: { amountPaid: newPaid, status: newStatus, paidAt: newStatus === 'paid' ? new Date() : inv.paidAt },
        });
        remaining = remaining.minus(applied);
        if (newStatus === 'paid') paidInvoices.push(inv);
      }

      if (remaining.greaterThan(0)) {
        await tx.payment.update({ where: { id: payment.id }, data: { amountUnallocated: remaining } });
      }
      await tx.auditLog.create({
        data: {
          organizationId: data.organizationId,
          actorId: userId,
          actorRole: 'system',
          action: 'payment_allocated',
          entityType: 'Payment',
          entityId: payment.id,
          changes: { invoiceIds: data.invoiceIds, amount: String(data.amount), surplus: remaining.toString() } as any,
        },
      });

      return { payment, invoices, paidInvoices, alreadyProcessed: false };
    });

    if (!result.alreadyProcessed) {
      for (const inv of result.paidInvoices) {
        this.paymentPlans.onInstallmentInvoicePaid(inv.id).catch(() => { /* swallow */ });
        this.sendPaidEmail(inv.id, result.payment.id).catch(() => { /* swallow */ });
      }
      const first = result.invoices[0];
      if (first) {
        this.webhooks.emit(data.organizationId, 'payment.received', {
          paymentId: result.payment.id,
          invoiceId: result.payment.invoiceId,
          amount: result.payment.amount.toString(),
          currency: result.payment.currency,
          method: result.payment.method,
          processorReference: result.payment.processorReference,
          processedAt: result.payment.processedAt?.toISOString?.() ?? null,
          unitId: first.unitId,
          invoiceCount: result.invoices.length,
        });
        const amountText = `${data.currency} ${Number(data.amount).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const unitLabel = first.unit?.unitNumber ? ` (Unit ${first.unit.unitNumber})` : '';
        this.notifications
          .notifyByRole({
            organizationId: data.organizationId,
            roleNames: ['hoa_admin', 'super_admin', 'finance_officer'],
            type: 'payment_received',
            title: `Payment received: ${amountText}`,
            body: `${amountText} prepaid across ${result.invoices.length} invoice(s)${unitLabel}.`,
            entityType: 'Invoice',
            entityId: first.id,
            actionUrl: `/finance/invoices/${first.id}`,
          })
          .catch(() => { /* swallow */ });
      }
    }
    return result.payment;
  }

  /** Best-effort, fire-and-forget notifications that must run AFTER the payment
   *  transaction commits (so reads see the committed rows). Never throws. */
  private firePaymentSideEffects(invoice: any, payment: any, newStatus: string) {
    // Advance a payment plan + close source invoices when fully paid.
    if (newStatus === 'paid') {
      this.paymentPlans.onInstallmentInvoicePaid(invoice.id).catch(() => { /* swallow */ });
    }

    // Emit webhook event for integrators.
    this.webhooks.emit(invoice.organizationId, 'payment.received', {
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      amount: payment.amount.toString(),
      currency: payment.currency,
      method: payment.method,
      processorReference: payment.processorReference,
      processedAt: payment.processedAt?.toISOString?.() ?? null,
      unitId: invoice.unitId,
    });

    if (newStatus === 'paid') {
      this.sendPaidEmail(invoice.id, payment.id).catch(() => { /* swallow */ });
    }

    const amountText = `${invoice.currency} ${Number(payment.amount.toString()).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const unitLabel = invoice.unit?.unitNumber ? ` (Unit ${invoice.unit.unitNumber})` : '';
    this.notifications
      .notifyByRole({
        organizationId: invoice.organizationId,
        roleNames: ['hoa_admin', 'super_admin', 'finance_officer'],
        type: 'payment_received',
        title: `Payment received: ${amountText}`,
        body: `${amountText} received on invoice ${invoice.invoiceNumber}${unitLabel}.`,
        entityType: 'Invoice',
        entityId: invoice.id,
        actionUrl: `/finance/invoices/${invoice.id}`,
        alsoEmail: {
          subject: `Payment received — ${invoice.invoiceNumber}`,
          message: `${amountText} has been received on invoice ${invoice.invoiceNumber}${unitLabel}. The invoice is now ${newStatus}.`,
          ctaLabel: 'View invoice',
          ctaUrl: `${ENTERPRISE_BASE}/finance/invoices/${invoice.id}`,
        },
      })
      .catch(() => { /* swallow */ });
  }

  /**
   * Reverse a payment (refund / chargeback). Removes its allocations, decrements
   * the affected invoices' `amountPaid`, recomputes their status, and marks the
   * receipt `reversed`. Transactional + row-locked; idempotent (a second reverse
   * is a no-op). Returns the updated payment.
   */
  async reversePayment(orgId: string, actorUserId: string, paymentId: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, organizationId: orgId },
        include: { allocations: true },
      });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.status === 'reversed') return payment;

      for (const alloc of payment.allocations) {
        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${alloc.invoiceId} FOR UPDATE`;
        const invoice = await tx.invoice.findUnique({ where: { id: alloc.invoiceId } });
        if (!invoice) continue;
        const newPaid = Decimal.max(new Decimal(invoice.amountPaid.toString()).minus(new Decimal(alloc.amount.toString())), new Decimal(0));
        const invAmount = new Decimal(invoice.amount.toString());
        const newStatus = newPaid.greaterThanOrEqualTo(invAmount) ? 'paid' : newPaid.greaterThan(0) ? 'partial' : 'sent';
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { amountPaid: newPaid, status: newStatus, paidAt: newStatus === 'paid' ? invoice.paidAt : null },
        });
      }

      await tx.paymentAllocation.deleteMany({ where: { paymentId: payment.id } });
      const reversed = await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'reversed', amountUnallocated: new Decimal(0) },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actorUserId,
          actorRole: 'system',
          action: 'payment_reversed',
          entityType: 'Payment',
          entityId: payment.id,
          changes: { reason: reason || null, amount: payment.amount.toString(), allocations: payment.allocations.length } as any,
        },
      });
      return reversed;
    });
  }

  /** Best-effort: reverse a completed payment matched by processor reference
   *  (used by the Paystack refund webhook). Returns null if no match. */
  async reverseByReference(orgId: string, reference: string, reason?: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { organizationId: orgId, processorReference: reference, status: 'completed' },
      select: { id: true },
    });
    if (!payment) return null;
    return this.reversePayment(orgId, 'system', payment.id, reason);
  }

  private async sendPaidEmail(invoiceId: string, paymentId: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { unit: { include: { occupancies: { where: { isActive: true }, include: { person: true } } } } },
    });
    if (!inv) return;
    const pmt = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!pmt) return;
    const personWithUser = inv.unit.occupancies.map((o) => o.person).find((p) => p?.userId);
    if (!personWithUser?.userId) return;
    const user = await this.prisma.user.findUnique({
      where: { id: personWithUser.userId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!user?.email) return;
    const amountFormatted = `${Number(pmt.amount.toString()).toLocaleString()} ${pmt.currency}`;
    await this.mail.enqueue({
      organizationId: inv.organizationId,
      templateKey: 'payment_received',
      data: {
        recipientFirstName: user.firstName,
        invoiceNumber: inv.invoiceNumber,
        amountFormatted,
        method: pmt.method,
      },
      to: user.email,
      toName: `${user.firstName} ${user.lastName}`,
      toUserId: user.id,
      entityType: 'Payment',
      entityId: pmt.id,
    });
  }

  async webhookMock(body: any) {
    // Mock payment webhook handler
    console.log('Mock payment webhook received:', body);
    return { received: true };
  }
}
