import { Injectable, NotFoundException } from '@nestjs/common';
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
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private webhooks: WebhooksService,
    private paymentPlans: PaymentPlansService,
    private mail: MailService,
    private notifications: NotificationsService,
  ) {}

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

  async logPayment(data: { invoiceId: string; amount: number; method: string; processorReference?: string }, userId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: data.invoiceId },
      include: {
        payments: { where: { status: 'completed' } },
        unit: { select: { unitNumber: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const payment = await this.prisma.payment.create({
      data: {
        invoiceId: data.invoiceId,
        amount: new Decimal(data.amount),
        currency: invoice.currency,
        method: data.method,
        processorReference: data.processorReference || `MOCK-${Date.now()}`,
        status: 'completed',
        processedAt: new Date(),
        loggedBy: userId,
      },
    });

    // Update invoice status
    const totalPaid = invoice.payments.reduce(
      (sum, p) => sum + Number(p.amount), 0
    ) + data.amount;

    const invoiceAmount = Number(invoice.amount);
    let newStatus = invoice.status;
    if (totalPaid >= invoiceAmount) {
      newStatus = 'paid';
    } else if (totalPaid > 0) {
      newStatus = 'partial';
    }

    if (newStatus !== invoice.status) {
      await this.prisma.invoice.update({
        where: { id: data.invoiceId },
        data: { status: newStatus, paidAt: newStatus === 'paid' ? new Date() : undefined },
      });
    }

    // Phase 1.2: if this invoice was a payment-plan installment, advance the
    // plan + close out source invoices when fully paid.
    if (newStatus === 'paid') {
      this.paymentPlans.onInstallmentInvoicePaid(invoice.id).catch(() => { /* swallow */ });
    }

    // Phase 9.2: emit webhook event so integrators get notified out-of-band.
    this.webhooks.emit(invoice.organizationId, 'payment.received', {
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      amount: payment.amount.toString(),
      currency: payment.currency,
      method: payment.method,
      processorReference: payment.processorReference,
      processedAt: payment.processedAt?.toISOString(),
      unitId: invoice.unitId,
    });

    // Phase 2.2: email the resident a receipt. Best-effort — never block
    // payment recording on email rendering.
    if (newStatus === 'paid') {
      this.sendPaidEmail(invoice.id, payment.id).catch(() => { /* swallow */ });
    }

    // Notify the finance/admin team in-app + email that a payment landed.
    // Fire-and-forget so we never slow the webhook/payment path.
    const amountText = `${invoice.currency} ${Number(data.amount).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

    return payment;
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
