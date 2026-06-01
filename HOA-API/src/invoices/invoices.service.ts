import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaginationDto, paginatedResponse, coercePagination } from '../common/dto';
import { Decimal } from '@prisma/client/runtime/library';
import { Actor, scopeInvoiceWhere } from '../common/scope.util';
import { FxService } from '../fx/fx.service';
import { NotificationsService } from '../notifications/notifications.service';
import { nextInvoiceNumber } from '../common/invoice-number';

const RESIDENT_BASE = (
  process.env.APP_RESIDENTS_URL ||
  process.env.RESIDENT_BASE_URL ||
  'http://localhost:3002'
).replace(/\/$/, '');

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  constructor(
    private prisma: PrismaService,
    private fx: FxService,
    private notifications: NotificationsService,
  ) {}

  async findAll(
    orgId: string,
    query: PaginationDto & { status?: string; unitId?: string; search?: string },
    actor?: Actor,
  ) {
    // Defensive coercion: ValidationPipe's @Type(() => Number) doesn't fire on
    // intersection types like `PaginationDto & {...}`, so `?limit=5` arrives
    // as the string '5' and crashes Prisma's take/skip.
    const { page, limit, skip } = coercePagination(query);
    const { search, status, unitId } = query || ({} as any);
    let where: any = { organizationId: orgId };
    if (status) where.status = status;
    if (unitId) where.unitId = unitId;
    if (search) {
      where.OR = [{ invoiceNumber: { contains: search, mode: 'insensitive' } }];
    }
    if (actor) where = scopeInvoiceWhere(where, actor);

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          unit: { include: { estate: true } },
          payments: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return paginatedResponse(data, total, page, limit);
  }

  /**
   * Aggregate figures for the Invoices dashboard: headline totals plus a
   * per-month time series of billed / collected / outstanding. Voided invoices
   * are excluded from every figure. Amounts are summed in the org's currency
   * (the app bills in a single org currency), matching how the UI formats them.
   *
   * Scoped to the actor (estate managers only see their estates) via the same
   * `scopeInvoiceWhere` used by the list, so the dashboard never leaks across
   * scope.
   */
  async stats(orgId: string, actor?: Actor, opts: { months?: number } = {}) {
    const months = Math.min(Math.max(opts.months ?? 12, 1), 36);
    let where: any = { organizationId: orgId, status: { not: 'voided' } };
    if (actor) where = scopeInvoiceWhere(where, actor);

    const rows = await this.prisma.invoice.findMany({
      where,
      select: { amount: true, amountPaid: true, status: true, dueDate: true, createdAt: true },
    });

    const now = new Date();
    // Build the trailing window of month buckets (oldest -> newest) up front so
    // empty months still appear on the chart.
    const buckets: { period: string; label: string; total: number; paid: number; unpaid: number; count: number }[] = [];
    const indexByPeriod = new Map<string, number>();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
      indexByPeriod.set(period, buckets.length);
      buckets.push({ period, label, total: 0, paid: 0, unpaid: 0, count: 0 });
    }

    let totalAmount = 0, totalPaid = 0, count = 0, paidCount = 0, unpaidCount = 0, overdueCount = 0;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (const r of rows) {
      const amt = Number(r.amount as any) || 0;
      const paid = Number(r.amountPaid as any) || 0;
      const outstanding = Math.max(amt - paid, 0);
      count += 1;
      totalAmount += amt;
      totalPaid += paid;
      if (outstanding <= 0.005) paidCount += 1; else unpaidCount += 1;
      if (outstanding > 0.005 && r.dueDate && new Date(r.dueDate) < today) overdueCount += 1;

      const d = new Date(r.createdAt);
      const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const idx = indexByPeriod.get(period);
      if (idx !== undefined) {
        buckets[idx].total += amt;
        buckets[idx].paid += paid;
        buckets[idx].unpaid += outstanding;
        buckets[idx].count += 1;
      }
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      totals: {
        count,
        amount: round(totalAmount),
        paid: round(totalPaid),
        outstanding: round(totalAmount - totalPaid),
        paidCount,
        unpaidCount,
        overdueCount,
      },
      series: buckets.map((b) => ({
        period: b.period,
        label: b.label,
        total: round(b.total),
        paid: round(b.paid),
        unpaid: round(b.unpaid),
        count: b.count,
      })),
    };
  }

  async findById(id: string, orgId: string, actor?: Actor) {
    const baseWhere: any = { id, organizationId: orgId };
    const where = actor ? scopeInvoiceWhere(baseWhere, actor) : baseWhere;
    const invoice = await this.prisma.invoice.findFirst({
      where,
      include: {
        unit: { include: { estate: true, occupancies: { where: { isActive: true }, include: { person: true } } } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async create(orgId: string, userId: string, data: any) {
    // Every invoice MUST have at least one valid line item — an empty/zero
    // invoice is never allowed (org policy). Line items carry unitPrice.
    const lineItems = (data.lineItems || []).filter(
      (item: any) => item && String(item.description || '').trim() && Number(item.unitPrice) > 0,
    );
    if (lineItems.length === 0) {
      throw new BadRequestException('An invoice must have at least one line item with a description and an amount greater than zero');
    }
    // total = Σ unitPrice × quantity.
    const amount = lineItems.reduce((sum: number, item: any) =>
      sum + ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 1)), 0);

    const invoiceNumber = await nextInvoiceNumber(this.prisma, orgId);

    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { currency: true },
    });
    const orgBaseCcy = (org.currency || 'ZAR').toUpperCase();
    const invoiceCcy = (data.currency || orgBaseCcy).toUpperCase();

    // Phase 8.2: lock the FX rate at issue time so future FX swings don't
    // change historical invoice values. No-op when invoice currency matches
    // org base. Best-effort: if no fresh rate is available we still create
    // the invoice — accountants can run /fx/sync or enter the rate manually.
    let lockedRate: Decimal | null = null;
    let lockedRateAsOf: Date | null = null;
    let baseCurrency: string | null = null;
    if (invoiceCcy !== orgBaseCcy) {
      try {
        const locked = await this.fx.lockedRateForInvoice(orgId, invoiceCcy, orgBaseCcy, new Date());
        if (locked) {
          lockedRate = locked.rate;
          lockedRateAsOf = locked.asOfDay;
          baseCurrency = locked.baseCurrency;
        }
      } catch (err: any) {
        this.logger.warn(`FX lock skipped for invoice ${invoiceNumber} (${invoiceCcy}→${orgBaseCcy}): ${err.message}`);
      }
    }

    return this.prisma.invoice.create({
      data: {
        organizationId: orgId,
        unitId: data.unitId,
        invoiceNumber,
        type: data.type || 'levy',
        amount: new Decimal(amount),
        currency: invoiceCcy,
        dueDate: new Date(data.dueDate),
        lineItems,
        notes: data.notes,
        createdBy: userId,
        baseCurrency,
        lockedRate,
        lockedRateAsOf,
      },
    });
  }

  async send(id: string, orgId: string) {
    const invoice = await this.findById(id, orgId);
    if (invoice.status !== 'draft') {
      throw new BadRequestException('Only draft invoices can be sent');
    }
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date() },
    });

    // Notify the unit's primary contact (in-app + email). Best-effort.
    const amountText = `${invoice.currency} ${Number(invoice.amount).toLocaleString('en', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    const dueText = new Date(invoice.dueDate).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const unitLabel = (invoice as any).unit?.unitNumber ? ` (Unit ${(invoice as any).unit.unitNumber})` : '';
    await this.notifications.notifyUnitContacts({
      organizationId: orgId,
      unitId: invoice.unitId,
      type: 'invoice_sent',
      title: `New invoice ${invoice.invoiceNumber}`,
      body: `${amountText} due ${dueText}.`,
      entityType: 'Invoice',
      entityId: invoice.id,
      actionUrl: `/invoices/${invoice.id}`,
      email: {
        subject: `Invoice ${invoice.invoiceNumber} from your HOA`,
        message: `A new invoice (${invoice.invoiceNumber}) for ${amountText} has been issued to your unit${unitLabel}.\n\nIt is due on ${dueText}. You can view and pay it from your resident portal.`,
        ctaLabel: 'View invoice',
        ctaUrl: `${RESIDENT_BASE}/invoices/${invoice.id}`,
      },
    });

    return updated;
  }

  async void(id: string, orgId: string) {
    const invoice = await this.findById(id, orgId);
    if (invoice.status === 'paid' || invoice.status === 'voided') {
      throw new BadRequestException('Cannot void this invoice');
    }
    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'voided' },
    });
  }

  /**
   * Hard-delete one or more UNPAID invoices (no money received) — for clearing
   * erroneous or abandoned-prepay bills. Invoices that have received any payment
   * are skipped (never delete a billed-and-paid record). Cascades remove any
   * pending payment intents on the deleted invoices.
   */
  async bulkDeleteUnpaid(orgId: string, actor: { userId: string; role: string }, ids: string[]) {
    if (!Array.isArray(ids) || ids.length === 0) throw new BadRequestException('ids is required');
    if (ids.length > 500) throw new BadRequestException('Cannot delete more than 500 invoices at once');

    const deletable = await this.prisma.invoice.findMany({
      where: { id: { in: ids }, organizationId: orgId, amountPaid: 0, status: { notIn: ['paid'] } },
      select: { id: true, invoiceNumber: true },
    });
    const delIds = deletable.map((d) => d.id);

    if (delIds.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.invoice.deleteMany({ where: { id: { in: delIds } } });
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorId: actor.userId,
            actorRole: actor.role,
            action: 'invoices_bulk_deleted',
            entityType: 'Invoice',
            entityId: delIds[0],
            changes: { deleted: delIds.length, invoiceNumbers: deletable.map((d) => d.invoiceNumber) } as any,
          },
        });
      });
    }

    return { deleted: delIds.length, skipped: ids.length - delIds.length };
  }
}
