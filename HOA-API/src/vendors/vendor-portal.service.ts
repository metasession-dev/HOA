import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { VendorInvoicesService, Actor } from './vendor-invoices.service';
import { SubmitVendorInvoiceDto } from './dto/vendors.dto';

/**
 * Vendor-facing surface: everything is scoped to the single Vendor record
 * linked to the logged-in user (Vendor.userId). Vendors never see other
 * vendors' data and only ever read their own invoices' status timeline —
 * internal approval details (approver identities, rules) are not exposed.
 */
@Injectable()
export class VendorPortalService {
  constructor(
    private prisma: PrismaService,
    private invoices: VendorInvoicesService,
  ) {}

  private async vendorForUser(userId: string, orgId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { userId, organizationId: orgId },
    });
    if (!vendor) {
      throw new ForbiddenException('No vendor profile is linked to your account.');
    }
    return vendor;
  }

  async me(userId: string, orgId: string) {
    const v = await this.vendorForUser(userId, orgId);
    return {
      id: v.id,
      name: v.name,
      email: v.email,
      phone: v.phone,
      status: v.status,
      preferredCurrency: v.preferredCurrency,
    };
  }

  async listInvoices(userId: string, orgId: string) {
    const v = await this.vendorForUser(userId, orgId);
    return this.prisma.vendorInvoice.findMany({
      where: { vendorId: v.id, organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        vendorInvoiceNo: true,
        amount: true,
        currency: true,
        status: true,
        issueDate: true,
        dueDate: true,
        paidAt: true,
        rejectedReason: true,
        createdAt: true,
      },
    });
  }

  async getInvoice(id: string, userId: string, orgId: string) {
    const v = await this.vendorForUser(userId, orgId);
    const inv = await this.prisma.vendorInvoice.findFirst({
      where: { id, vendorId: v.id, organizationId: orgId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!inv) throw new NotFoundException('Invoice not found');

    // Only surface the status timeline — never internal approver identities.
    const timeline = inv.events
      .filter((e) => e.type === 'status_change')
      .map((e) => ({ status: (e.payload as any)?.to ?? null, at: e.createdAt }));

    return {
      id: inv.id,
      vendorInvoiceNo: inv.vendorInvoiceNo,
      amount: inv.amount,
      currency: inv.currency,
      vatAmount: inv.vatAmount,
      status: inv.status,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      paidAt: inv.paidAt,
      paymentReference: inv.paymentReference,
      rejectedReason: inv.rejectedReason,
      lineItems: inv.lineItems,
      attachments: inv.attachments,
      notes: inv.notes,
      timeline,
    };
  }

  async submitInvoice(
    userId: string,
    orgId: string,
    role: string,
    dto: SubmitVendorInvoiceDto,
  ) {
    const v = await this.vendorForUser(userId, orgId);
    const actor: Actor = { userId, role };
    // Vendor invoices always use the org's settings currency — vendors don't
    // pick a currency. Force it server-side (currencyOverride bypasses the
    // preferred-currency mismatch guard) so a stale/forged client value can't
    // change it.
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { currency: true },
    });
    const currency = (org?.currency || 'ZAR').toUpperCase();
    // vendorId is forced to the logged-in vendor — clients can't submit for
    // another vendor. Reuses the full capture + approval-routing pipeline.
    return this.invoices.create(orgId, actor, {
      ...dto,
      vendorId: v.id,
      currency,
      currencyOverride: true,
    } as any);
  }
}
