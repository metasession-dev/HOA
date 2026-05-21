import { Tool, OPERATIONS_ROLES } from './types';

/**
 * Operations tools — requests, communications, gate passes, violations, resale.
 */

const openRequests: Tool = {
  name: 'operations_open_requests',
  domain: 'operations',
  description:
    'List maintenance / resident requests that are still open, optionally filtered by priority. Use for "what requests need attention", "any urgent requests", "what is open in maintenance".',
  parameters: {
    type: 'object',
    properties: {
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
      limit: { type: 'number', description: 'Max rows (default 20, cap 100).' },
    },
  },
  allowedRoles: OPERATIONS_ROLES,
  async execute(args, { actor, prisma }) {
    const take = Math.min(100, Math.max(1, args.limit ?? 20));
    const where: any = {
      organizationId: actor.organizationId,
      status: { in: ['submitted', 'triaged', 'in_progress', 'waiting_resident'] },
    };
    if (args.priority) where.priority = args.priority;
    const [rows, byStatus] = await Promise.all([
      prisma.request.findMany({
        where,
        select: {
          id: true, subject: true, status: true, priority: true, createdAt: true, dueAt: true,
          unit: { select: { unitNumber: true, estate: { select: { name: true } } } },
          category: { select: { name: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take,
      }),
      prisma.request.groupBy({
        by: ['status'],
        where: { organizationId: actor.organizationId },
        _count: { _all: true },
      }),
    ]);
    const statusCounts: Record<string, number> = {};
    for (const g of byStatus) statusCounts[g.status] = g._count._all;
    const overdue = rows.filter((r) => r.dueAt && r.dueAt < new Date()).length;
    return {
      data: { rows, statusCounts, overdue },
      summary: `${rows.length} open request${rows.length === 1 ? '' : 's'} (${overdue} overdue)`,
    };
  },
};

const activeGatePasses: Tool = {
  name: 'operations_active_gate_passes',
  domain: 'operations',
  description:
    'List currently-active gate passes (visitors expected today + valid passes). Use for "who is expected at the gate", "active visitors".',
  parameters: {
    type: 'object',
    properties: { limit: { type: 'number' } },
  },
  allowedRoles: OPERATIONS_ROLES,
  async execute(args, { actor, prisma }) {
    const take = Math.min(100, Math.max(1, args.limit ?? 25));
    const now = new Date();
    const rows = await prisma.gatePass.findMany({
      where: {
        organizationId: actor.organizationId,
        status: 'active',
        validFrom: { lte: now },
        validUntil: { gte: now },
      },
      select: {
        id: true, code: true, visitorName: true, type: true, vehicleReg: true,
        validFrom: true, validUntil: true, usesCount: true, maxUses: true,
        unit: { select: { unitNumber: true, estate: { select: { name: true } } } },
      },
      orderBy: { validFrom: 'asc' },
      take,
    });
    return {
      data: rows,
      summary: `${rows.length} active gate pass${rows.length === 1 ? '' : 'es'}`,
    };
  },
};

const todayGateActivity: Tool = {
  name: 'operations_today_gate_activity',
  domain: 'operations',
  description:
    'Summary of gate entries / exits / overrides / denials in the last 24h. Use for "how many people came through the gate", "gate activity today".',
  parameters: { type: 'object', properties: {} },
  allowedRoles: OPERATIONS_ROLES,
  async execute(_args, { actor, prisma }) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const groups = await prisma.visitorLog.groupBy({
      by: ['type'],
      where: {
        gatePass: { organizationId: actor.organizationId },
        occurredAt: { gte: since },
      },
      _count: { _all: true },
    });
    const counts: Record<string, number> = { entry: 0, exit: 0, override_entry: 0, denied: 0 };
    for (const g of groups) counts[g.type] = g._count._all;
    return {
      data: counts,
      summary: `Last 24h · ${counts.entry} entries, ${counts.exit} exits, ${counts.override_entry} overrides, ${counts.denied} denied`,
    };
  },
};

const violationsOpen: Tool = {
  name: 'operations_violations_open',
  domain: 'operations',
  description:
    'List open violations (not closed/dismissed). Use for "what violations are open", "any unresolved violations".',
  parameters: {
    type: 'object',
    properties: { limit: { type: 'number' } },
  },
  allowedRoles: OPERATIONS_ROLES,
  async execute(args, { actor, prisma }) {
    const take = Math.min(50, Math.max(1, args.limit ?? 15));
    const rows = await prisma.violation.findMany({
      where: {
        organizationId: actor.organizationId,
        status: { in: ['open', 'noticed', 'acknowledged', 'appealing', 'board_review'] },
      },
      select: {
        id: true, status: true, description: true, occurredAt: true, fineAmount: true,
        category: { select: { name: true } },
        unit: { select: { unitNumber: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take,
    });
    return {
      data: rows.map((r) => ({ ...r, fineAmount: r.fineAmount?.toString() ?? null })),
      summary: `${rows.length} open violation${rows.length === 1 ? '' : 's'}`,
    };
  },
};

const recentBroadcasts: Tool = {
  name: 'operations_recent_broadcasts',
  domain: 'operations',
  description:
    'Recent communications broadcasts to residents (sent and queued). Use for "what did we send last week", "recent notices".',
  parameters: {
    type: 'object',
    properties: { limit: { type: 'number' } },
  },
  allowedRoles: OPERATIONS_ROLES,
  async execute(args, { actor, prisma }) {
    const take = Math.min(20, Math.max(1, args.limit ?? 5));
    const rows = await prisma.broadcast.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true, subject: true, status: true, channels: true,
        sentAt: true, resolvedRecipients: true, successCount: true, failureCount: true, optOutCount: true,
      },
    });
    return {
      data: rows,
      summary: `${rows.length} broadcast${rows.length === 1 ? '' : 's'} returned (most recent first)`,
    };
  },
};

const resalePending: Tool = {
  name: 'operations_resale_pending',
  domain: 'operations',
  description:
    'List resale certificates that are in progress (draft or under attorney review). Use for "any property transfers pending", "open resale documents".',
  parameters: { type: 'object', properties: {} },
  allowedRoles: OPERATIONS_ROLES,
  async execute(_args, { actor, prisma }) {
    const rows = await prisma.resaleCertificate.findMany({
      where: {
        organizationId: actor.organizationId,
        status: { in: ['draft', 'issued'] },
      },
      select: {
        id: true, certificateNumber: true, status: true, rushProcessing: true,
        slaDueAt: true, issuedAt: true, outstandingAtSnapshot: true,
        unit: { select: { unitNumber: true, estate: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return {
      data: rows.map((r) => ({
        ...r,
        outstandingAtSnapshot: r.outstandingAtSnapshot.toString(),
      })),
      summary: `${rows.length} resale certificate${rows.length === 1 ? '' : 's'} in progress`,
    };
  },
};

export const OPERATIONS_TOOLS: Tool[] = [
  openRequests,
  activeGatePasses,
  todayGateActivity,
  violationsOpen,
  recentBroadcasts,
  resalePending,
];
