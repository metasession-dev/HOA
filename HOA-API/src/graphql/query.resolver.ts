import { Args, Int, Query, Resolver, Float } from '@nestjs/graphql';
import { ForbiddenException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';
import { coercePagination } from '../common/dto';
import { scopeInvoiceWhere, scopePassWhere, scopeRequestWhere, isResidentRole } from '../common/scope.util';
import {
  OrganizationGQL, EstateGQL, UnitGQL, InvoiceGQL, PaymentGQL,
  RequestGQL, BroadcastGQL, InvoicesPageGQL,
} from './types';

/**
 * Phase 9.1 GraphQL query surface.
 *
 * Same auth + scope as REST: JwtAuthGuard from the global guard chain is
 * already in effect (Apollo doesn't bypass it because we route GraphQL
 * through the same Nest app). Resident scoping uses the existing
 * `scope*Where` helpers so the GraphQL surface inherits every RBAC fix made
 * to REST.
 *
 * Decimal fields are coerced to strings to keep precision intact (JS
 * numbers can't safely represent 99,999,999,999.99).
 */
@Resolver()
@UseGuards(JwtAuthGuard)
export class QueryResolver {
  constructor(private prisma: PrismaService) {}

  @Query(() => OrganizationGQL, { nullable: true })
  async organization(
    @CurrentUser('organizationId') orgId: string,
  ): Promise<OrganizationGQL | null> {
    if (!orgId) return null;
    const row = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      currency: row.currency,
      country: row.country,
      timezone: row.timezone,
      language: row.language,
      createdAt: row.createdAt.toISOString(),
    };
  }

  @Query(() => [EstateGQL])
  async estates(@CurrentUser('organizationId') orgId: string): Promise<EstateGQL[]> {
    const rows = await this.prisma.estate.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
      take: 200,
    });
    return rows.map((e) => ({
      id: e.id, name: e.name, address: e.address, totalUnits: e.totalUnits,
    }));
  }

  @Query(() => [UnitGQL])
  async units(
    @CurrentUser('organizationId') orgId: string,
    @Args('estateId', { type: () => String, nullable: true }) estateId?: string,
  ): Promise<UnitGQL[]> {
    const where: any = { estate: { organizationId: orgId } };
    if (estateId) where.estateId = estateId;
    const rows = await this.prisma.unit.findMany({ where, orderBy: { unitNumber: 'asc' }, take: 500 });
    return rows.map((u) => ({
      id: u.id, unitNumber: u.unitNumber, block: u.block, floor: u.floor,
      type: u.type, tags: u.tags, estateId: u.estateId,
    }));
  }

  @Query(() => InvoicesPageGQL)
  async invoices(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Args('page', { type: () => Int, nullable: true }) page?: number,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('status', { type: () => String, nullable: true }) status?: string,
    @Args('unitId', { type: () => String, nullable: true }) unitId?: string,
  ): Promise<InvoicesPageGQL> {
    const coerced = coercePagination({ page, limit });
    let where: any = { organizationId: orgId };
    if (status) where.status = status;
    if (unitId) where.unitId = unitId;
    where = scopeInvoiceWhere(where, { userId, role });
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where, skip: coerced.skip, take: coerced.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return {
      data: rows.map((i) => ({
        id: i.id, invoiceNumber: i.invoiceNumber, type: i.type,
        amount: i.amount.toString(), currency: i.currency,
        status: i.status, dueDate: i.dueDate.toISOString(),
        paidAt: i.paidAt?.toISOString() ?? null,
        sentAt: i.sentAt?.toISOString() ?? null,
        unitId: i.unitId, createdAt: i.createdAt.toISOString(),
      })),
      meta: {
        total, page: coerced.page, limit: coerced.limit,
        totalPages: Math.ceil(total / coerced.limit),
      },
    };
  }

  @Query(() => InvoiceGQL, { nullable: true })
  async invoice(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Args('id') id: string,
  ): Promise<InvoiceGQL | null> {
    const where = scopeInvoiceWhere({ id, organizationId: orgId }, { userId, role });
    const i = await this.prisma.invoice.findFirst({ where });
    if (!i) return null;
    return {
      id: i.id, invoiceNumber: i.invoiceNumber, type: i.type,
      amount: i.amount.toString(), currency: i.currency,
      status: i.status, dueDate: i.dueDate.toISOString(),
      paidAt: i.paidAt?.toISOString() ?? null,
      sentAt: i.sentAt?.toISOString() ?? null,
      unitId: i.unitId, createdAt: i.createdAt.toISOString(),
    };
  }

  @Query(() => [PaymentGQL])
  async payments(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Args('invoiceId', { type: () => String, nullable: true }) invoiceId?: string,
  ): Promise<PaymentGQL[]> {
    let where: any = { invoice: { organizationId: orgId } };
    if (invoiceId) where.invoiceId = invoiceId;
    if (isResidentRole(role)) {
      where = {
        ...where,
        invoice: {
          ...where.invoice,
          unit: { occupancies: { some: { isActive: true, person: { userId } } } },
        },
      };
    }
    const rows = await this.prisma.payment.findMany({
      where, take: 200, orderBy: { createdAt: 'desc' },
    });
    return rows.map((p) => ({
      id: p.id, amount: p.amount.toString(), currency: p.currency,
      method: p.method, status: p.status,
      processedAt: p.processedAt?.toISOString() ?? null,
      processorReference: p.processorReference ?? null,
      invoiceId: p.invoiceId,
    }));
  }

  @Query(() => [RequestGQL])
  async requests(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Args('status', { type: () => String, nullable: true }) status?: string,
  ): Promise<RequestGQL[]> {
    let where: any = { organizationId: orgId };
    if (status) where.status = status;
    where = scopeRequestWhere(where, { userId, role });
    const rows = await this.prisma.request.findMany({
      where, take: 200, orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id, subject: r.subject, body: r.body, status: r.status,
      priority: r.priority, unitId: r.unitId, categoryId: r.categoryId,
      dueAt: r.dueAt?.toISOString() ?? null,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  @Query(() => [BroadcastGQL])
  async broadcasts(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('role') role: string,
  ): Promise<BroadcastGQL[]> {
    if (isResidentRole(role)) throw new ForbiddenException('Residents cannot query broadcasts');
    const rows = await this.prisma.broadcast.findMany({
      where: { organizationId: orgId },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((b) => ({
      id: b.id, subject: b.subject, status: b.status, channels: b.channels,
      scheduledAt: b.scheduledAt?.toISOString() ?? null,
      sentAt: b.sentAt?.toISOString() ?? null,
      resolvedRecipients: b.resolvedRecipients,
      successCount: b.successCount,
      failureCount: b.failureCount,
      optOutCount: b.optOutCount,
    }));
  }
}
