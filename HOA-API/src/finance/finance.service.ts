import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  // GL Accounts
  async getGLAccounts(orgId: string) {
    return this.prisma.gLAccount.findMany({
      where: { organizationId: orgId },
      orderBy: { code: 'asc' },
      include: { children: true },
    });
  }

  async createGLAccount(orgId: string, data: { code: string; name: string; type: string; parentId?: string }) {
    return this.prisma.gLAccount.create({
      data: { organizationId: orgId, ...data },
    });
  }

  async updateGLAccount(id: string, data: { name?: string; isActive?: boolean }) {
    return this.prisma.gLAccount.update({ where: { id }, data });
  }

  // Journal Entries
  async getJournalEntries(orgId: string, page?: number, limit?: number) {
    // Express+Nest passes undefined for absent query params; the function-default
    // `= 1` only applies when the arg is omitted entirely. Coerce here.
    const p = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
    const l = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 20;
    const [data, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where: { organizationId: orgId },
        skip: (p - 1) * l,
        take: l,
        orderBy: { date: 'desc' },
      }),
      this.prisma.journalEntry.count({ where: { organizationId: orgId } }),
    ]);
    return { success: true, data, meta: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
  }

  async createJournalEntry(orgId: string, userId: string, data: any) {
    const lines = data.lines || [];
    const totalDebit = lines.reduce((sum: number, l: any) => sum + (l.debit || 0), 0);
    const totalCredit = lines.reduce((sum: number, l: any) => sum + (l.credit || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error('Debits must equal credits');
    }

    const count = await this.prisma.journalEntry.count({ where: { organizationId: orgId } });
    const reference = `JE-${String(count + 1).padStart(5, '0')}`;

    return this.prisma.journalEntry.create({
      data: {
        organizationId: orgId,
        date: new Date(data.date),
        reference,
        description: data.description,
        lines: data.lines,
        createdBy: userId,
        postedAt: new Date(),
      },
    });
  }

  // Reports
  async getTrialBalance(orgId: string) {
    const accounts = await this.prisma.gLAccount.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { code: 'asc' },
    });

    const journalEntries = await this.prisma.journalEntry.findMany({
      where: { organizationId: orgId, postedAt: { not: null } },
    });

    const balances: Record<string, { debit: number; credit: number }> = {};
    for (const account of accounts) {
      balances[account.id] = { debit: 0, credit: 0 };
    }

    for (const entry of journalEntries) {
      const lines = entry.lines as any[];
      for (const line of lines) {
        if (balances[line.glAccountId]) {
          balances[line.glAccountId].debit += line.debit || 0;
          balances[line.glAccountId].credit += line.credit || 0;
        }
      }
    }

    return accounts.map((account) => ({
      ...account,
      debit: balances[account.id]?.debit || 0,
      credit: balances[account.id]?.credit || 0,
      balance: (balances[account.id]?.debit || 0) - (balances[account.id]?.credit || 0),
    }));
  }

  async getArrearsReport(orgId: string) {
    const overdue = await this.prisma.invoice.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['sent', 'partial', 'overdue'] },
        dueDate: { lt: new Date() },
      },
      include: {
        unit: { include: { estate: true, occupancies: { where: { isActive: true }, include: { person: true } } } },
        payments: { where: { status: 'completed' } },
      },
      orderBy: { dueDate: 'asc' },
    });

    return overdue.map((inv) => {
      const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        unitNumber: inv.unit.unitNumber,
        estateName: inv.unit.estate.name,
        resident: inv.unit.occupancies[0]?.person
          ? `${inv.unit.occupancies[0].person.firstName} ${inv.unit.occupancies[0].person.lastName}`
          : 'N/A',
        amount: Number(inv.amount),
        paid,
        outstanding: Number(inv.amount) - paid,
        dueDate: inv.dueDate,
        daysOverdue: Math.floor((Date.now() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24)),
      };
    });
  }

  /**
   * Billing collections report over a period: how much was billed, how much has
   * been collected, how much is outstanding, plus the list of units/residents
   * who still owe money (defaulters), sorted by amount.
   *
   * Scoped to invoices ISSUED within [from, to] (issue date = createdAt). Voided
   * invoices are excluded. `collected` uses the server-authoritative amountPaid
   * cache. All amounts are in the org currency.
   */
  async getCollectionsReport(orgId: string, from: Date, to: Date) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { currency: true },
    });
    const currency = (org.currency || 'ZAR').toUpperCase();
    // Make `to` inclusive of the whole day (queries pass YYYY-MM-DD = midnight).
    const toEnd = new Date(to.getTime() + 86_399_999);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId: orgId,
        status: { not: 'voided' },
        createdAt: { gte: from, lte: toEnd },
      },
      include: {
        unit: { include: { estate: true, occupancies: { where: { isActive: true }, include: { person: true } } } },
      },
    });

    let billed = 0, collected = 0;
    const now = Date.now();
    const byUnit = new Map<string, {
      unitId: string; unitNumber: string; estateName: string; resident: string;
      billed: number; collected: number; outstanding: number; invoiceCount: number; oldestDueDate: Date;
    }>();

    for (const inv of invoices) {
      const amt = Number(inv.amount) || 0;
      const paid = Number(inv.amountPaid) || 0;
      const outstanding = Math.max(amt - paid, 0);
      billed += amt;
      collected += paid;
      if (outstanding <= 0.005) continue;

      const resident = inv.unit.occupancies[0]?.person
        ? `${inv.unit.occupancies[0].person.firstName} ${inv.unit.occupancies[0].person.lastName}`
        : 'No active resident';
      const cur = byUnit.get(inv.unitId) || {
        unitId: inv.unitId, unitNumber: inv.unit.unitNumber, estateName: inv.unit.estate.name,
        resident, billed: 0, collected: 0, outstanding: 0, invoiceCount: 0, oldestDueDate: inv.dueDate,
      };
      cur.billed += amt;
      cur.collected += paid;
      cur.outstanding += outstanding;
      cur.invoiceCount += 1;
      if (inv.dueDate < cur.oldestDueDate) cur.oldestDueDate = inv.dueDate;
      byUnit.set(inv.unitId, cur);
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const defaulters = Array.from(byUnit.values())
      .map((d) => ({
        unitId: d.unitId,
        unitNumber: d.unitNumber,
        estateName: d.estateName,
        resident: d.resident,
        billed: round(d.billed),
        collected: round(d.collected),
        outstanding: round(d.outstanding),
        invoiceCount: d.invoiceCount,
        oldestDueDate: d.oldestDueDate,
        daysOverdue: d.oldestDueDate < new Date() ? Math.floor((now - d.oldestDueDate.getTime()) / 86_400_000) : 0,
      }))
      .sort((a, b) => b.outstanding - a.outstanding);

    return {
      currency,
      period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
      totals: {
        billed: round(billed),
        collected: round(collected),
        outstanding: round(billed - collected),
        collectionRate: billed > 0 ? Math.round((collected / billed) * 100) : 0,
        invoiceCount: invoices.length,
        defaulterUnits: defaulters.length,
      },
      defaulters,
    };
  }
}
