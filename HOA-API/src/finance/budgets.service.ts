import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';

export type Actor = { userId: string; role: string };

export type BudgetLineInput = {
  glAccountId: string;
  amounts: number[]; // 12 monthly figures (Jan..Dec)
  notes?: string;
};

export type CreateBudgetInput = {
  name: string;
  fiscalYear: number;
  fundId?: string;
  currency?: string;
  notes?: string;
  lines: BudgetLineInput[];
};

const BUDGET_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'closed'],
  active: ['closed'],
  closed: [],
};

@Injectable()
export class BudgetsService {
  constructor(private prisma: PrismaService) {}

  async list(orgId: string, query: { status?: string; fiscalYear?: number; fundId?: string }) {
    const where: Prisma.BudgetWhereInput = { organizationId: orgId };
    if (query.status) where.status = query.status;
    if (query.fiscalYear) where.fiscalYear = query.fiscalYear;
    if (query.fundId) where.fundId = query.fundId;
    return this.prisma.budget.findMany({
      where,
      include: { fund: { select: { id: true, name: true, type: true } }, lines: true },
      orderBy: [{ fiscalYear: 'desc' }, { name: 'asc' }],
    });
  }

  async findById(id: string, orgId: string) {
    const b = await this.prisma.budget.findFirst({
      where: { id, organizationId: orgId },
      include: {
        fund: true,
        lines: true,
      },
    });
    if (!b) throw new NotFoundException('Budget not found');
    return b;
  }

  async create(orgId: string, actor: Actor, dto: CreateBudgetInput) {
    this.validateLines(dto.lines);
    if (dto.fundId) {
      const fund = await this.prisma.fund.findFirst({
        where: { id: dto.fundId, organizationId: orgId, isActive: true },
      });
      if (!fund) throw new BadRequestException('Invalid fund');
    }
    await this.validateGlAccounts(orgId, dto.lines.map((l) => l.glAccountId));
    // Resolve the default currency from the org settings — never assume ZAR.
    // The client SHOULD send `currency` (the frontend reads getOrgCurrency()),
    // but old callers + integrations might not, so we fall back to the org's
    // configured currency. Only a missing org row drops us to ZAR — and that
    // would already have failed validation above.
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { currency: true },
    });
    const resolvedCurrency = (dto.currency ?? org?.currency ?? 'ZAR').toUpperCase();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.budget.create({
          data: {
            organizationId: orgId,
            fundId: dto.fundId,
            name: dto.name,
            fiscalYear: dto.fiscalYear,
            currency: resolvedCurrency,
            notes: dto.notes,
            createdBy: actor.userId,
            lines: {
              create: dto.lines.map((l) => ({
                glAccountId: l.glAccountId,
                amounts: l.amounts.map((a) => new Decimal(a)),
                notes: l.notes,
              })),
            },
          },
          include: { lines: true, fund: true },
        });
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorId: actor.userId,
            actorRole: actor.role,
            action: 'created',
            entityType: 'Budget',
            entityId: created.id,
            changes: {
              fiscalYear: dto.fiscalYear,
              lineCount: dto.lines.length,
              fundId: dto.fundId,
            } as any,
          },
        });
        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          `Budget "${dto.name}" already exists for fiscal year ${dto.fiscalYear}`,
        );
      }
      throw err;
    }
  }

  async update(
    id: string,
    orgId: string,
    actor: Actor,
    dto: { name?: string; notes?: string; lines?: BudgetLineInput[] },
  ) {
    const existing = await this.findById(id, orgId);
    if (existing.status !== 'draft') {
      throw new ConflictException('Budget can only be edited while in draft status');
    }
    if (dto.lines) {
      this.validateLines(dto.lines);
      await this.validateGlAccounts(orgId, dto.lines.map((l) => l.glAccountId));
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.budget.update({
        where: { id },
        data: {
          name: dto.name,
          notes: dto.notes,
          ...(dto.lines
            ? {
                lines: {
                  deleteMany: {},
                  create: dto.lines.map((l) => ({
                    glAccountId: l.glAccountId,
                    amounts: l.amounts.map((a) => new Decimal(a)),
                    notes: l.notes,
                  })),
                },
              }
            : {}),
        },
        include: { lines: true, fund: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'updated',
          entityType: 'Budget',
          entityId: id,
          changes: { before: existing, after: updated } as any,
        },
      });
      return updated;
    });
  }

  async transition(id: string, orgId: string, actor: Actor, target: 'active' | 'closed') {
    return this.prisma.$transaction(async (tx) => {
      const b = await tx.budget.findFirst({ where: { id, organizationId: orgId } });
      if (!b) throw new NotFoundException('Budget not found');
      if (!BUDGET_TRANSITIONS[b.status]?.includes(target)) {
        throw new ConflictException(`Cannot transition budget from ${b.status} to ${target}`);
      }
      // Only one active budget per (fiscalYear, fundId) at a time
      if (target === 'active') {
        const conflict = await tx.budget.findFirst({
          where: {
            organizationId: orgId,
            fiscalYear: b.fiscalYear,
            fundId: b.fundId,
            status: 'active',
            id: { not: id },
          },
        });
        if (conflict) {
          throw new ConflictException(
            `Another budget (${conflict.name}) is already active for ${b.fiscalYear}${b.fundId ? ' in this fund' : ''}`,
          );
        }
      }
      const data: Prisma.BudgetUpdateInput = { status: target };
      if (target === 'active') {
        data.approvedAt = new Date();
        data.approvedBy = actor.userId;
      } else if (target === 'closed') {
        data.closedAt = new Date();
      }
      const updated = await tx.budget.update({ where: { id }, data });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: target === 'active' ? 'approved' : 'closed',
          entityType: 'Budget',
          entityId: id,
          changes: { from: b.status, to: target } as any,
        },
      });
      return updated;
    });
  }

  /**
   * Compute variance for a budget: budgeted vs actual (from posted journal lines)
   * up to a given month. Returns per-line variance + totals.
   *
   * @param asOfMonth 1-12, defaults to current month
   */
  async variance(id: string, orgId: string, asOfMonth?: number) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, organizationId: orgId },
      include: { lines: true, fund: true },
    });
    if (!budget) throw new NotFoundException('Budget not found');

    // Pick a sensible default `asOfMonth` based on where the budget sits in
    // time. The naive default (`new Date().getUTCMonth() + 1`) was wrong for
    // past years: viewing a closed FY2025 budget in 2026 would default to
    // January, hiding 11 months of actuals. Closed budgets always default to
    // full-year; past-year budgets default to full-year too.
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    let defaultMonth: number;
    if (budget.fiscalYear < currentYear || budget.status === 'closed') {
      defaultMonth = 12;
    } else if (budget.fiscalYear > currentYear) {
      defaultMonth = 1;
    } else {
      defaultMonth = now.getUTCMonth() + 1;
    }
    const month = Math.max(1, Math.min(12, asOfMonth ?? defaultMonth));
    const yearStart = new Date(Date.UTC(budget.fiscalYear, 0, 1));
    const yearEnd = new Date(Date.UTC(budget.fiscalYear, month, 0, 23, 59, 59, 999));

    const glIds = budget.lines.map((l) => l.glAccountId);
    const [glAccounts, journalEntries] = await Promise.all([
      this.prisma.gLAccount.findMany({
        where: { id: { in: glIds } },
        select: { id: true, code: true, name: true, type: true },
      }),
      this.prisma.journalEntry.findMany({
        where: {
          organizationId: orgId,
          postedAt: { not: null },
          date: { gte: yearStart, lte: yearEnd },
          ...(budget.fundId ? { fundId: budget.fundId } : {}),
        },
        select: { lines: true },
      }),
    ]);

    // Build actuals per glAccountId
    const actualsByGl: Record<string, Decimal> = {};
    for (const entry of journalEntries) {
      const lines = Array.isArray(entry.lines) ? entry.lines : [];
      for (const line of lines as any[]) {
        if (!line || !glIds.includes(line.glAccountId)) continue;
        // For income accounts: actual = credits - debits. For expense: debits - credits.
        const gl = glAccounts.find((g) => g.id === line.glAccountId);
        if (!gl) continue;
        const d = new Decimal(line.debit ?? 0);
        const c = new Decimal(line.credit ?? 0);
        const delta = gl.type === 'income' ? c.minus(d) : d.minus(c);
        actualsByGl[gl.id] = (actualsByGl[gl.id] ?? new Decimal(0)).add(delta);
      }
    }

    let budgetTotal = new Decimal(0);
    let actualTotal = new Decimal(0);
    const lines = budget.lines.flatMap((bl) => {
      const gl = glAccounts.find((g) => g.id === bl.glAccountId);
      // A budget line can outlive its GL account (delete races, soft-delete,
      // org-wide chart-of-accounts cleanup). Skip the line in that case rather
      // than crashing the whole variance view — and report it so the UI can
      // surface a "linked account missing" badge if it wants to.
      if (!gl) {
        return [{
          glAccountId: bl.glAccountId,
          code: '???',
          name: 'Account no longer exists',
          type: 'expense' as const,
          monthlyAmounts: bl.amounts.map((a) => Number(a.toString())),
          budgeted: 0,
          actual: 0,
          variance: 0,
          variancePct: null,
          notes: bl.notes,
          orphaned: true,
        }];
      }
      // Budgeted = sum of months 1..month
      const monthlyAmounts = bl.amounts.map((a) => new Decimal(a.toString()));
      const budgeted = monthlyAmounts
        .slice(0, month)
        .reduce((s, a) => s.add(a), new Decimal(0));
      const actual = actualsByGl[bl.glAccountId] ?? new Decimal(0);
      const varianceVal = budgeted.minus(actual);
      const variancePct = budgeted.isZero()
        ? null
        : Number(varianceVal.div(budgeted).times(100).toFixed(2));
      budgetTotal = budgetTotal.add(budgeted);
      actualTotal = actualTotal.add(actual);
      return [{
        glAccountId: gl.id,
        code: gl.code,
        name: gl.name,
        type: gl.type,
        monthlyAmounts: monthlyAmounts.map((a) => Number(a.toFixed(2))),
        budgeted: Number(budgeted.toFixed(2)),
        actual: Number(actual.toFixed(2)),
        variance: Number(varianceVal.toFixed(2)),
        variancePct,
        notes: bl.notes,
        orphaned: false,
      }];
    });

    const totalVariance = budgetTotal.minus(actualTotal);
    return {
      budget: { id: budget.id, name: budget.name, fiscalYear: budget.fiscalYear, status: budget.status, currency: budget.currency, fund: budget.fund },
      asOfMonth: month,
      lines,
      totals: {
        budgeted: Number(budgetTotal.toFixed(2)),
        actual: Number(actualTotal.toFixed(2)),
        variance: Number(totalVariance.toFixed(2)),
        variancePct: budgetTotal.isZero() ? null : Number(totalVariance.div(budgetTotal).times(100).toFixed(2)),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private validateLines(lines: BudgetLineInput[]) {
    if (!lines || lines.length === 0) {
      throw new BadRequestException('Budget must have at least one line');
    }
    for (const l of lines) {
      if (!Array.isArray(l.amounts) || l.amounts.length !== 12) {
        throw new BadRequestException(`Budget line ${l.glAccountId} must have exactly 12 monthly amounts`);
      }
      for (const a of l.amounts) {
        if (typeof a !== 'number' || !Number.isFinite(a)) {
          throw new BadRequestException(`Budget line ${l.glAccountId} has invalid amounts`);
        }
        // Negative budget amounts don't have a coherent meaning for income or
        // expense lines and almost always indicate a typo (e.g. an attempt at
        // a reversal). Reject early so finance doesn't end up with budgets
        // showing variance that doesn't reconcile to a sane plan.
        if (a < 0) {
          throw new BadRequestException(`Budget line ${l.glAccountId} cannot have negative amounts`);
        }
      }
    }
    // Each GL account must be unique within the budget — otherwise variance
    // computations would double-count actuals against the same account.
    const seen = new Set<string>();
    for (const l of lines) {
      if (seen.has(l.glAccountId)) {
        throw new BadRequestException(`Duplicate GL account in budget: ${l.glAccountId}`);
      }
      seen.add(l.glAccountId);
    }
  }

  private async validateGlAccounts(orgId: string, ids: string[]) {
    const found = await this.prisma.gLAccount.findMany({
      where: { id: { in: ids }, organizationId: orgId },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException('One or more GL accounts are invalid for this org');
    }
  }
}
