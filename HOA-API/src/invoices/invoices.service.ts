import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaginationDto, paginatedResponse, coercePagination } from '../common/dto';
import { Decimal } from '@prisma/client/runtime/library';
import { Actor, scopeInvoiceWhere } from '../common/scope.util';
import { FxService } from '../fx/fx.service';
import { NotificationsService } from '../notifications/notifications.service';

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
    const lineItems = data.lineItems || [];
    // Line items carry unitPrice (per the DTO); total = Σ unitPrice × quantity.
    const amount = lineItems.reduce((sum: number, item: any) =>
      sum + ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 1)), 0);

    const count = await this.prisma.invoice.count({ where: { organizationId: orgId } });
    const invoiceNumber = `INV-${String(count + 1).padStart(5, '0')}`;

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
}
