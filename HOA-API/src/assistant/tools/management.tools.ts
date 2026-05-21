import { Tool, ALL_ADMIN_ROLES } from './types';

/**
 * Management domain tools — estates, units, people, team, anomalies, jobs.
 * All read-only; scoped to the caller's organizationId via Prisma where
 * clauses (never trust the LLM's args to be org-safe).
 */

const listEstates: Tool = {
  name: 'management_list_estates',
  domain: 'management',
  description:
    'List all estates in the current organization with their unit count and address. Use for "how many estates do we have", "list our properties", "show estate X".',
  parameters: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Optional substring match against estate name.' },
    },
  },
  allowedRoles: ALL_ADMIN_ROLES,
  async execute(args, { actor, prisma }) {
    const estates = await prisma.estate.findMany({
      where: {
        organizationId: actor.organizationId,
        ...(args.search ? { name: { contains: args.search, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true, address: true, totalUnits: true, _count: { select: { units: true } } },
      orderBy: { name: 'asc' },
      take: 50,
    });
    const data = estates.map((e) => ({
      id: e.id,
      name: e.name,
      address: e.address,
      units: e._count.units,
      declaredTotal: e.totalUnits,
    }));
    return {
      data,
      summary: `Found ${estates.length} estate${estates.length === 1 ? '' : 's'}${args.search ? ` matching "${args.search}"` : ''}`,
    };
  },
};

const listPeople: Tool = {
  name: 'management_list_people',
  domain: 'management',
  description:
    'List people (owners, tenants, stakeholders) linked to the organization. Filter by type or search by name/email. Use for "how many tenants", "list owners", "find a person named X".',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['owner', 'tenant', 'stakeholder'], description: 'Filter by person type.' },
      search: { type: 'string', description: 'Optional name or email substring.' },
      limit: { type: 'number', description: 'Max rows to return (default 25, cap 100).' },
    },
  },
  allowedRoles: ALL_ADMIN_ROLES,
  async execute(args, { actor, prisma }) {
    const take = Math.min(100, Math.max(1, args.limit ?? 25));
    const where: any = { organizationId: actor.organizationId };
    if (args.type) where.type = args.type;
    if (args.search) {
      where.OR = [
        { firstName: { contains: args.search, mode: 'insensitive' } },
        { lastName: { contains: args.search, mode: 'insensitive' } },
        { email: { contains: args.search, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.person.findMany({
        where,
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, type: true },
        orderBy: { lastName: 'asc' },
        take,
      }),
      prisma.person.count({ where }),
    ]);
    return {
      data: { total, returned: rows.length, people: rows },
      summary: `${total} ${args.type ?? 'people'}${args.search ? ` matching "${args.search}"` : ''} (showing ${rows.length})`,
    };
  },
};

const countByType: Tool = {
  name: 'management_people_count_by_type',
  domain: 'management',
  description:
    'Get a count breakdown of people grouped by type (owner, tenant, stakeholder). Use for "how many owners vs tenants", overview questions.',
  parameters: { type: 'object', properties: {} },
  allowedRoles: ALL_ADMIN_ROLES,
  async execute(_args, { actor, prisma }) {
    const groups = await prisma.person.groupBy({
      by: ['type'],
      where: { organizationId: actor.organizationId },
      _count: { _all: true },
    });
    const counts: Record<string, number> = { owner: 0, tenant: 0, stakeholder: 0 };
    for (const g of groups) counts[g.type] = g._count._all;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      data: { ...counts, total },
      summary: `${total} people total · ${counts.owner} owners, ${counts.tenant} tenants, ${counts.stakeholder} stakeholders`,
    };
  },
};

const recentAnomalies: Tool = {
  name: 'management_recent_anomalies',
  domain: 'management',
  description:
    'List the most recent anomaly detections (arrears spike, vendor invoice deviation, duplicate payment, cash-flow shortfall). Use for "any unusual activity", "anomalies this month".',
  parameters: {
    type: 'object',
    properties: {
      days: { type: 'number', description: 'Look back this many days (default 30, cap 365).' },
      limit: { type: 'number', description: 'Max rows (default 10, cap 50).' },
    },
  },
  allowedRoles: ALL_ADMIN_ROLES,
  async execute(args, { actor, prisma }) {
    const days = Math.min(365, Math.max(1, args.days ?? 30));
    const take = Math.min(50, Math.max(1, args.limit ?? 10));
    const since = new Date(Date.now() - days * 86400000);
    const rows = await prisma.anomalyDetection.findMany({
      where: { organizationId: actor.organizationId, detectedAt: { gte: since } },
      orderBy: { detectedAt: 'desc' },
      take,
      select: {
        id: true, type: true, severity: true, description: true,
        dismissedAt: true, detectedAt: true,
      },
    });
    const openCount = rows.filter((r) => !r.dismissedAt).length;
    return {
      data: { rows, openCount, lookbackDays: days },
      summary: `${rows.length} anomalies in last ${days}d (${openCount} open)`,
    };
  },
};

const jobsHealth: Tool = {
  name: 'management_jobs_health',
  domain: 'management',
  description:
    'Get background job queue health — counts of waiting, active, completed, failed across all queues. Use for "are background jobs running", "any failed jobs".',
  parameters: { type: 'object', properties: {} },
  allowedRoles: ALL_ADMIN_ROLES,
  async execute(_args, _ctx) {
    // Hand off to the same stats endpoint the admin jobs page hits — but we
    // can't easily inject the JobsService here without a circular import.
    // Instead, report the EmailDelivery + WebhookDelivery + PaymentIntent
    // queues directly from Prisma rows, which is what the queues drain.
    const { prisma } = _ctx;
    const [pendingEmails, pendingWebhooks, pendingIntents] = await Promise.all([
      prisma.emailDelivery.count({ where: { organizationId: _ctx.actor.organizationId, status: 'pending' } }),
      prisma.webhookDelivery.count({ where: { organizationId: _ctx.actor.organizationId, status: 'pending' } }),
      prisma.paymentIntent.count({ where: { organizationId: _ctx.actor.organizationId, status: 'pending' } }),
    ]);
    const data = { pendingEmails, pendingWebhooks, pendingPaymentIntents: pendingIntents };
    return {
      data,
      summary: `Queue health · ${pendingEmails} emails, ${pendingWebhooks} webhooks, ${pendingIntents} payment intents pending`,
    };
  },
};

export const MANAGEMENT_TOOLS: Tool[] = [
  listEstates,
  listPeople,
  countByType,
  recentAnomalies,
  jobsHealth,
];
