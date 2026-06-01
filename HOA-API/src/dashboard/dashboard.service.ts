import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';

export type Range = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type Persona = 'admin' | 'board' | 'finance' | 'gate' | 'resident';
export type Actor = { userId: string; role: string; organizationId: string };

const RANGE_DAYS: Record<Range, number> = { day: 1, week: 7, month: 30, quarter: 90, year: 365 };

const ADMIN_ROLES = new Set(['hoa_admin', 'super_admin', 'property_manager']);
const BOARD_ROLES = new Set(['exco_member', 'exco_chairperson']);
const FINANCE_ROLES = new Set(['finance_officer', 'external_accountant']);
const GATE_ROLES = new Set(['gate_security']);
const RESIDENT_ROLES = new Set(['owner', 'tenant']);

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  /** Returns the persona shape based on role. */
  personaFor(role: string): Persona {
    if (ADMIN_ROLES.has(role)) return 'admin';
    if (BOARD_ROLES.has(role)) return 'board';
    if (FINANCE_ROLES.has(role)) return 'finance';
    if (GATE_ROLES.has(role)) return 'gate';
    return 'resident';
  }

  /**
   * Build the dashboard payload for the actor. When `personaOverride` is
   * given, the controller has already verified the actor is allowed to
   * preview a different persona (admins-only). For everyone else, persona
   * derives strictly from role.
   */
  async forActor(actor: Actor, range: Range = 'month', personaOverride?: Persona) {
    const persona = personaOverride ?? this.personaFor(actor.role);
    const since = new Date(Date.now() - RANGE_DAYS[range] * 86400000);
    switch (persona) {
      case 'admin': return { persona, range, ...(await this.adminWidgets(actor.organizationId, since)) };
      case 'board': return { persona, range, ...(await this.boardWidgets(actor.organizationId, since)) };
      case 'finance': return { persona, range, ...(await this.financeWidgets(actor.organizationId, since)) };
      case 'gate': return { persona, range, ...(await this.gateWidgets(actor.organizationId, since)) };
      case 'resident': return { persona, range, ...(await this.residentWidgets(actor, since)) };
    }
  }

  // ============================================================
  // Admin / property manager — wide operational view
  // ============================================================
  private async adminWidgets(orgId: string, since: Date) {
    const [
      estates,
      units,
      activeOccupancies,
      invoicesTotal, invoicesOverdue, invoicesSent,
      paymentsAgg,
      openViolations,
      openVotes,
      pendingApprovals,
      issuedGatePassesToday,
      recentInvoices,
      recentPayments,
    ] = await Promise.all([
      this.prisma.estate.count({ where: { organizationId: orgId } }),
      this.prisma.unit.count({ where: { estate: { organizationId: orgId } } }),
      this.prisma.unitOccupancy.count({ where: { isActive: true, unit: { estate: { organizationId: orgId } } } }),
      this.prisma.invoice.count({ where: { organizationId: orgId } }),
      this.prisma.invoice.count({ where: { organizationId: orgId, status: { in: ['sent', 'partial', 'overdue'] }, dueDate: { lt: new Date() } } }),
      this.prisma.invoice.count({ where: { organizationId: orgId, status: 'sent', createdAt: { gte: since } } }),
      this.prisma.payment.aggregate({
        where: { status: 'completed', invoice: { organizationId: orgId }, createdAt: { gte: since } },
        _sum: { amount: true }, _count: true,
      }),
      this.prisma.violation.count({ where: { organizationId: orgId, status: { in: ['open', 'noticed', 'acknowledged', 'appealing', 'board_review'] } } }),
      this.prisma.vote.count({ where: { organizationId: orgId, status: 'open' } }),
      this.prisma.vendorInvoice.count({ where: { organizationId: orgId, status: 'pending_approval' } }),
      this.prisma.gatePass.count({ where: { organizationId: orgId, createdAt: { gte: startOfToday() } } }),
      this.prisma.invoice.findMany({
        where: { organizationId: orgId },
        include: { unit: { select: { unitNumber: true } } },
        orderBy: { createdAt: 'desc' }, take: 5,
      }),
      this.prisma.payment.findMany({
        where: { invoice: { organizationId: orgId } },
        include: { invoice: { select: { invoiceNumber: true, unit: { select: { unitNumber: true } } } } },
        orderBy: { createdAt: 'desc' }, take: 5,
      }),
    ]);

    const totalsAllTime = await this.prisma.invoice.aggregate({
      where: { organizationId: orgId },
      _sum: { amount: true },
    });
    const paidAllTime = await this.prisma.payment.aggregate({
      where: { status: 'completed', invoice: { organizationId: orgId } },
      _sum: { amount: true },
    });
    const outstanding = new Decimal(totalsAllTime._sum.amount?.toString() ?? '0')
      .minus(new Decimal(paidAllTime._sum.amount?.toString() ?? '0'));

    return {
      stats: {
        estates, units, activeOccupancies,
        invoicesTotal, invoicesOverdue, invoicesSentInRange: invoicesSent,
        paymentsInRange: paymentsAgg._count,
        collectedInRange: Number((paymentsAgg._sum.amount ?? new Decimal(0)).toString()),
        outstandingAllTime: Number(outstanding.toFixed(2)),
        openViolations, openVotes, pendingApprovals,
        gatePassesToday: issuedGatePassesToday,
      },
      activity: {
        recentInvoices: recentInvoices.map((i) => ({
          id: i.id, invoiceNumber: i.invoiceNumber,
          unitNumber: i.unit.unitNumber,
          amount: Number(i.amount.toString()), status: i.status, createdAt: i.createdAt,
        })),
        recentPayments: recentPayments.map((p) => ({
          id: p.id,
          invoiceNumber: p.invoice?.invoiceNumber ?? '—',
          unitNumber: p.invoice?.unit?.unitNumber ?? '—',
          amount: Number(p.amount.toString()),
          status: p.status, method: p.method,
          at: p.processedAt ?? p.createdAt,
        })),
      },
    };
  }

  // ============================================================
  // Board / exco — governance + approvals + financial high level
  // ============================================================
  private async boardWidgets(orgId: string, since: Date) {
    const [openVotes, mineToApprove, pendingApprovals, openViolations, recentVotes, recentResales] = await Promise.all([
      this.prisma.vote.findMany({
        where: { organizationId: orgId, status: 'open' },
        select: { id: true, title: true, type: true, closesAt: true, options: true, eligibleCountSnapshot: true, _count: { select: { ballots: true } } },
        orderBy: { closesAt: 'asc' }, take: 5,
      }),
      // Board may be in the approval chain for vendor invoices
      this.prisma.vendorInvoice.findMany({
        where: {
          organizationId: orgId, status: 'pending_approval',
          approvals: { some: { decision: 'pending', requiredRole: { in: ['exco_member', 'exco_chairperson'] } } },
        },
        include: { vendor: { select: { name: true } } },
        orderBy: { createdAt: 'asc' }, take: 5,
      }),
      this.prisma.vendorInvoice.count({ where: { organizationId: orgId, status: 'pending_approval' } }),
      this.prisma.violation.count({ where: { organizationId: orgId, status: { in: ['appealing', 'board_review'] } } }),
      this.prisma.vote.findMany({
        where: { organizationId: orgId, status: 'closed', closedAt: { gte: since } },
        select: { id: true, title: true, outcome: true, closedAt: true },
        orderBy: { closedAt: 'desc' }, take: 5,
      }),
      this.prisma.resaleCertificate.count({ where: { organizationId: orgId, status: 'issued', issuedAt: { gte: since } } }),
    ]);

    return {
      stats: {
        openVotes: openVotes.length,
        mineToApprove: mineToApprove.length,
        pendingApprovals,
        appealsForReview: openViolations,
        resaleCertsIssuedInRange: recentResales,
      },
      activity: {
        openVotes: openVotes.map((v) => ({
          id: v.id, title: v.title, type: v.type, closesAt: v.closesAt,
          ballotsCast: v._count.ballots,
          eligibleCount: v.eligibleCountSnapshot,
        })),
        mineToApprove: mineToApprove.map((i) => ({
          id: i.id, vendorInvoiceNo: i.vendorInvoiceNo, vendorName: i.vendor.name,
          amount: Number(i.amount.toString()), currency: i.currency, dueDate: i.dueDate,
        })),
        recentVotes: recentVotes,
      },
    };
  }

  // ============================================================
  // Finance officer — ledger and AR focus
  // ============================================================
  private async financeWidgets(orgId: string, since: Date) {
    const [
      arrearsCount, arrearsSum,
      pendingApprovals, approvedToPay,
      unmatchedTxnsByAccount,
      paymentsAgg,
    ] = await Promise.all([
      this.prisma.invoice.count({ where: { organizationId: orgId, status: { in: ['sent', 'partial', 'overdue'] }, dueDate: { lt: new Date() } } }),
      this.prisma.invoice.aggregate({
        where: { organizationId: orgId, status: { in: ['sent', 'partial', 'overdue'] }, dueDate: { lt: new Date() } },
        _sum: { amount: true },
      }),
      this.prisma.vendorInvoice.count({ where: { organizationId: orgId, status: 'pending_approval' } }),
      this.prisma.vendorInvoice.aggregate({
        where: { organizationId: orgId, status: 'approved' },
        _sum: { amount: true }, _count: true,
      }),
      this.prisma.bankTransaction.groupBy({
        by: ['bankAccountId'],
        where: { bankAccount: { organizationId: orgId }, status: 'unmatched' },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { status: 'completed', invoice: { organizationId: orgId }, createdAt: { gte: since } },
        _sum: { amount: true }, _count: true,
      }),
    ]);

    return {
      stats: {
        arrearsCount,
        arrearsAmount: Number((arrearsSum._sum.amount ?? new Decimal(0)).toString()),
        pendingApprovals,
        approvedToPayCount: approvedToPay._count,
        approvedToPayAmount: Number((approvedToPay._sum.amount ?? new Decimal(0)).toString()),
        unmatchedBankTxns: unmatchedTxnsByAccount.reduce((s, g) => s + g._count, 0),
        paymentsInRange: paymentsAgg._count,
        collectedInRange: Number((paymentsAgg._sum.amount ?? new Decimal(0)).toString()),
      },
    };
  }

  // ============================================================
  // Gate / security
  // ============================================================
  private async gateWidgets(orgId: string, since: Date) {
    const [activePasses, todayEntries, todayExpected] = await Promise.all([
      this.prisma.gatePass.count({
        where: { organizationId: orgId, status: 'active', validUntil: { gte: new Date() } },
      }),
      this.prisma.visitorLog.count({
        where: { gatePass: { organizationId: orgId }, occurredAt: { gte: startOfToday() }, type: 'entry' },
      }),
      this.prisma.gatePass.count({
        where: {
          organizationId: orgId, status: 'active',
          validFrom: { lte: endOfToday() }, validUntil: { gte: startOfToday() },
        },
      }),
    ]);
    const recent = await this.prisma.visitorLog.findMany({
      where: { gatePass: { organizationId: orgId }, occurredAt: { gte: since } },
      include: { gatePass: { select: { visitorName: true, code: true, unit: { select: { unitNumber: true } } } } },
      orderBy: { occurredAt: 'desc' }, take: 10,
    });
    return {
      stats: { activePasses, todayEntries, todayExpected },
      activity: {
        recentVisitorLogs: recent.map((l) => ({
          id: l.id, type: l.type,
          visitorName: l.gatePass?.visitorName,
          code: l.gatePass?.code,
          unitNumber: l.gatePass?.unit?.unitNumber,
          at: l.occurredAt,
        })),
      },
    };
  }

  // ============================================================
  // Resident / tenant — only their own data
  // ============================================================
  private async residentWidgets(actor: Actor, since: Date) {
    // Find the Person(s) for this user in this org, then their active occupancies → invoices, gate passes, violations
    const persons = await this.prisma.person.findMany({
      where: { userId: actor.userId, organizationId: actor.organizationId },
      select: { id: true },
    });
    const personIds = persons.map((p) => p.id);
    if (personIds.length === 0) {
      // Logged-in user has no Person record. Return shell.
      return { stats: { invoicesDue: 0, totalOutstanding: 0, openPasses: 0, openViolations: 0 }, activity: { recentInvoices: [], recentPasses: [], recentNotices: [] } };
    }
    const occupancies = await this.prisma.unitOccupancy.findMany({
      where: { personId: { in: personIds }, isActive: true },
      select: { unitId: true, role: true },
    });
    const unitIds = occupancies.map((o) => o.unitId);
    const isOwner = occupancies.some((o) => o.role === 'owner');

    const [invoices, openPasses, openViolations, notices, paymentsAgg, totalsAgg, paidAgg] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { unitId: { in: unitIds }, status: { in: ['sent', 'partial', 'overdue'] } },
        orderBy: { dueDate: 'asc' }, take: 5,
      }),
      this.prisma.gatePass.count({
        where: { unitId: { in: unitIds }, status: 'active', validUntil: { gte: new Date() } },
      }),
      this.prisma.violation.count({
        where: { unitId: { in: unitIds }, status: { in: ['open', 'noticed', 'acknowledged', 'appealing', 'board_review'] } },
      }),
      this.prisma.broadcast.findMany({
        where: { organizationId: actor.organizationId, status: { in: ['sent', 'queued'] } },
        orderBy: { createdAt: 'desc' }, take: 5,
      }),
      this.prisma.payment.aggregate({
        where: { status: 'completed', invoice: { unitId: { in: unitIds } }, createdAt: { gte: since } },
        _sum: { amount: true }, _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { unitId: { in: unitIds } },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'completed', invoice: { unitId: { in: unitIds } } },
        _sum: { amount: true },
      }),
    ]);
    const outstanding = new Decimal(totalsAgg._sum.amount?.toString() ?? '0')
      .minus(new Decimal(paidAgg._sum.amount?.toString() ?? '0'));

    return {
      stats: {
        invoicesDue: invoices.length,
        totalOutstanding: Number(outstanding.toFixed(2)),
        openPasses,
        openViolations,
        paymentsInRange: paymentsAgg._count,
        isOwner,
      },
      activity: {
        recentInvoices: invoices.map((i) => ({
          id: i.id, invoiceNumber: i.invoiceNumber,
          amount: Number(i.amount.toString()), status: i.status, dueDate: i.dueDate,
        })),
        recentNotices: notices.map((b) => ({
          id: b.id, subject: b.subject, sentAt: b.sentAt ?? b.createdAt,
        })),
      },
    };
  }
}

function startOfToday(): Date {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d;
}
function endOfToday(): Date {
  const d = new Date(); d.setUTCHours(23, 59, 59, 999); return d;
}
