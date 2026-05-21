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
}
