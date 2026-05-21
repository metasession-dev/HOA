import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { estates: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async update(id: string, data: { name?: string; country?: string; currency?: string; timezone?: string; language?: string; settings?: any }) {
    return this.prisma.organization.update({ where: { id }, data });
  }

  /**
   * Phase 10.2 — branding settings exposed to the resident PWA and admin app.
   * Light validation: hex colour must be #RGB or #RRGGBB so the CSS variable
   * we inject can't smuggle in a stylesheet escape.
   */
  async updateBranding(
    id: string,
    data: { logoUrl?: string | null; accentColor?: string | null; brandingTagline?: string | null },
  ) {
    if (data.accentColor && !/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(data.accentColor)) {
      throw new Error('accentColor must be a hex value like #RRGGBB');
    }
    return this.prisma.organization.update({
      where: { id },
      data: {
        logoUrl: data.logoUrl === undefined ? undefined : data.logoUrl,
        accentColor: data.accentColor === undefined ? undefined : data.accentColor,
        brandingTagline: data.brandingTagline === undefined ? undefined : data.brandingTagline,
      },
      select: {
        id: true, name: true, slug: true,
        logoUrl: true, accentColor: true, brandingTagline: true,
      },
    });
  }

  /** Public-safe branding payload — used by the resident login page before auth. */
  async getBrandingBySlug(slug: string) {
    return this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, logoUrl: true, accentColor: true, brandingTagline: true },
    });
  }

  async getDashboardStats(orgId: string) {
    const [totalEstates, totalUnits, totalInvoices, totalPayments, overdueInvoices] = await Promise.all([
      this.prisma.estate.count({ where: { organizationId: orgId } }),
      this.prisma.unit.count({ where: { estate: { organizationId: orgId } } }),
      this.prisma.invoice.count({ where: { organizationId: orgId } }),
      this.prisma.payment.count({ where: { invoice: { organizationId: orgId }, status: 'completed' } }),
      this.prisma.invoice.count({ where: { organizationId: orgId, status: 'overdue' } }),
    ]);

    const totalCollected = await this.prisma.payment.aggregate({
      where: { invoice: { organizationId: orgId }, status: 'completed' },
      _sum: { amount: true },
    });

    const totalOutstanding = await this.prisma.invoice.aggregate({
      where: { organizationId: orgId, status: { in: ['sent', 'partial', 'overdue'] } },
      _sum: { amount: true },
    });

    return {
      totalEstates,
      totalUnits,
      totalInvoices,
      totalPayments,
      overdueInvoices,
      totalCollected: totalCollected._sum.amount || 0,
      totalOutstanding: totalOutstanding._sum.amount || 0,
    };
  }
}
