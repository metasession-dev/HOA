import { Tool, FINANCE_ROLES } from './types';

/**
 * Finance domain tools — invoices, payments, payables, vendors, funds, budgets.
 * Numeric results return ISO-string decimals (avoid float JSON precision loss).
 */

const invoicesSummary: Tool = {
  name: 'finance_invoices_summary',
  domain: 'finance',
  description:
    'Get an aggregate summary of invoices: counts + totals by status (draft, sent, partial, paid, overdue, void). Use for "what is our collection rate", "how much is outstanding".',
  parameters: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'ISO date — invoices issued on/after this date.' },
      to: { type: 'string', description: 'ISO date — invoices issued on/before this date.' },
    },
  },
  allowedRoles: FINANCE_ROLES,
  async execute(args, { actor, prisma }) {
    const where: any = { organizationId: actor.organizationId };
    if (args.from || args.to) {
      where.createdAt = {};
      if (args.from) where.createdAt.gte = new Date(args.from);
      if (args.to) where.createdAt.lte = new Date(args.to);
    }
    const groups = await prisma.invoice.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: { amount: true },
    });
    const summary: Record<string, { count: number; total: string }> = {};
    let totalAmount = 0;
    for (const g of groups) {
      summary[g.status] = { count: g._count._all, total: g._sum.amount?.toString() ?? '0' };
      totalAmount += Number(g._sum.amount ?? 0);
    }
    const overdue = summary['overdue'];
    return {
      data: { byStatus: summary, totalAmount: totalAmount.toFixed(2) },
      summary: overdue
        ? `${Object.values(summary).reduce((s, x) => s + x.count, 0)} invoices, ${overdue.count} overdue (${overdue.total})`
        : `${Object.values(summary).reduce((s, x) => s + x.count, 0)} invoices`,
    };
  },
};

const topArrears: Tool = {
  name: 'finance_top_arrears',
  domain: 'finance',
  description:
    'List the units with the largest outstanding balances. Sorted descending. Use for "who owes the most", "biggest debtors".',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'How many units to return (default 10, cap 50).' },
    },
  },
  allowedRoles: FINANCE_ROLES,
  async execute(args, { actor, prisma }) {
    const take = Math.min(50, Math.max(1, args.limit ?? 10));
    // Aggregate unpaid invoices per unit.
    const rows = await prisma.invoice.groupBy({
      by: ['unitId'],
      where: {
        organizationId: actor.organizationId,
        status: { in: ['sent', 'partial', 'overdue'] },
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take,
    });
    const unitIds = rows.map((r) => r.unitId);
    const units = await prisma.unit.findMany({
      where: { id: { in: unitIds } },
      select: {
        id: true, unitNumber: true, block: true,
        estate: { select: { name: true } },
        occupancies: {
          where: { isActive: true, isPrimaryContact: true },
          select: { person: { select: { firstName: true, lastName: true } } },
          take: 1,
        },
      },
    });
    const map = new Map(units.map((u) => [u.id, u]));
    const result = rows.map((r) => {
      const u = map.get(r.unitId);
      const primary = u?.occupancies?.[0]?.person;
      return {
        unitId: r.unitId,
        unitNumber: u?.unitNumber,
        estate: u?.estate?.name,
        primaryContact: primary ? `${primary.firstName} ${primary.lastName}` : null,
        outstanding: r._sum.amount?.toString() ?? '0',
      };
    });
    return {
      data: result,
      summary: `Top ${result.length} unit${result.length === 1 ? '' : 's'} in arrears (largest: ${result[0]?.outstanding ?? 0})`,
    };
  },
};

const paymentsThisPeriod: Tool = {
  name: 'finance_payments_this_period',
  domain: 'finance',
  description:
    'Total payments collected in a date range, by method (eft, card, mobile_money, paystack). Use for "how much did we collect this month", "payment method mix".',
  parameters: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'ISO date (defaults to start of current month).' },
      to: { type: 'string', description: 'ISO date (defaults to today).' },
    },
  },
  allowedRoles: FINANCE_ROLES,
  async execute(args, { actor, prisma }) {
    const to = args.to ? new Date(args.to) : new Date();
    const from = args.from
      ? new Date(args.from)
      : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
    const groups = await prisma.payment.groupBy({
      by: ['method'],
      where: {
        invoice: { organizationId: actor.organizationId },
        status: 'completed',
        processedAt: { gte: from, lte: to },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const byMethod = groups.map((g) => ({
      method: g.method,
      total: g._sum.amount?.toString() ?? '0',
      count: g._count._all,
    }));
    const total = byMethod.reduce((s, x) => s + Number(x.total), 0);
    return {
      data: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), byMethod, total: total.toFixed(2) },
      summary: `Collected ${total.toFixed(2)} from ${byMethod.reduce((s, x) => s + x.count, 0)} payments (${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)})`,
    };
  },
};

const vendorsList: Tool = {
  name: 'finance_vendors_list',
  domain: 'finance',
  description:
    'List vendors registered for this organization with status. Use for "show vendors", "any suspended vendors".',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['active', 'suspended', 'blacklisted'] },
    },
  },
  allowedRoles: FINANCE_ROLES,
  async execute(args, { actor, prisma }) {
    const where: any = { organizationId: actor.organizationId };
    if (args.status) where.status = args.status;
    const rows = await prisma.vendor.findMany({
      where,
      select: { id: true, name: true, status: true, email: true, preferredCurrency: true },
      orderBy: { name: 'asc' },
      take: 50,
    });
    return {
      data: rows,
      summary: `${rows.length} vendor${rows.length === 1 ? '' : 's'}${args.status ? ` (${args.status})` : ''}`,
    };
  },
};

const pendingApprovals: Tool = {
  name: 'finance_pending_approvals',
  domain: 'finance',
  description:
    'List vendor invoices awaiting the current user\'s approval, plus any pending approvals across the org. Use for "what needs my approval", "pending payables".',
  parameters: { type: 'object', properties: {} },
  allowedRoles: FINANCE_ROLES,
  async execute(_args, { actor, prisma }) {
    const [mine, orgTotal] = await Promise.all([
      prisma.approval.count({ where: { approverUserId: actor.userId, decision: 'pending' } }),
      prisma.approval.count({
        where: {
          vendorInvoice: { organizationId: actor.organizationId },
          decision: 'pending',
        },
      }),
    ]);
    return {
      data: { mine, orgTotal },
      summary: `${mine} awaiting your decision · ${orgTotal} pending across org`,
    };
  },
};

const fundsBalances: Tool = {
  name: 'finance_funds_balances',
  domain: 'finance',
  description:
    'Snapshot of every active fund (operating, reserve, sinking, special_levy) with its opening balance. Use for "reserve fund balance", "how healthy is our levy fund".',
  parameters: { type: 'object', properties: {} },
  allowedRoles: FINANCE_ROLES,
  async execute(_args, { actor, prisma }) {
    const funds = await prisma.fund.findMany({
      where: { organizationId: actor.organizationId, isActive: true },
      select: { id: true, name: true, type: true, openingBalance: true },
      orderBy: { name: 'asc' },
    });
    return {
      data: funds.map((f) => ({
        ...f,
        openingBalance: f.openingBalance.toString(),
      })),
      summary: `${funds.length} active fund${funds.length === 1 ? '' : 's'}`,
    };
  },
};

export const FINANCE_TOOLS: Tool[] = [
  invoicesSummary,
  topArrears,
  paymentsThisPeriod,
  vendorsList,
  pendingApprovals,
  fundsBalances,
];
