import { Injectable, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';

/**
 * Financial statements. All amounts are returned as `number` (not Decimal) for
 * easy JSON serialization. Internal aggregation uses Decimal to avoid floating
 * point drift over hundreds of journal lines.
 */

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

type LineTotals = { debit: Decimal; credit: Decimal };

type AccountSummary = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
  balance: number;
};

export type IncomeStatement = {
  organizationId: string;
  currency: string;
  from: string;
  to: string;
  income: { accounts: AccountSummary[]; total: number };
  expenses: { accounts: AccountSummary[]; total: number };
  netSurplus: number;
  generatedAt: string;
};

export type BalanceSheet = {
  organizationId: string;
  currency: string;
  asOf: string;
  assets: { accounts: AccountSummary[]; total: number };
  liabilities: { accounts: AccountSummary[]; total: number };
  equity: { accounts: AccountSummary[]; total: number };
  retainedSurplus: number;
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
  generatedAt: string;
};

export type CashFlowStatement = {
  organizationId: string;
  currency: string;
  from: string;
  to: string;
  operating: { inflows: number; outflows: number; net: number; categories: CashCategory[] };
  investing: { inflows: number; outflows: number; net: number; categories: CashCategory[] };
  financing: { inflows: number; outflows: number; net: number; categories: CashCategory[] };
  netChange: number;
  openingCash: number;
  closingCash: number;
  generatedAt: string;
};

export type CashCategory = {
  accountId: string;
  code: string;
  name: string;
  inflows: number;
  outflows: number;
  net: number;
};

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // ============================================================
  // Income Statement (profit & loss for a period)
  // ============================================================
  async incomeStatement(orgId: string, from: Date, to: Date): Promise<IncomeStatement> {
    if (from > to) throw new BadRequestException('from must be <= to');

    const [org, accounts, entries] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { currency: true } }),
      this.prisma.gLAccount.findMany({
        where: { organizationId: orgId, type: { in: ['income', 'expense'] }, isActive: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.journalEntry.findMany({
        where: { organizationId: orgId, postedAt: { not: null }, date: { gte: from, lte: to } },
        select: { lines: true },
      }),
    ]);

    const totals = this.aggregateJournalLines(entries);

    const income: AccountSummary[] = [];
    const expenses: AccountSummary[] = [];
    let incomeTotal = new Decimal(0);
    let expenseTotal = new Decimal(0);

    for (const acct of accounts) {
      const t = totals[acct.id] ?? { debit: new Decimal(0), credit: new Decimal(0) };
      if (acct.type === 'income') {
        const balance = t.credit.minus(t.debit);
        income.push({
          id: acct.id, code: acct.code, name: acct.name, type: 'income',
          debit: Number(t.debit.toFixed(2)),
          credit: Number(t.credit.toFixed(2)),
          balance: Number(balance.toFixed(2)),
        });
        incomeTotal = incomeTotal.add(balance);
      } else if (acct.type === 'expense') {
        const balance = t.debit.minus(t.credit);
        expenses.push({
          id: acct.id, code: acct.code, name: acct.name, type: 'expense',
          debit: Number(t.debit.toFixed(2)),
          credit: Number(t.credit.toFixed(2)),
          balance: Number(balance.toFixed(2)),
        });
        expenseTotal = expenseTotal.add(balance);
      }
    }

    const netSurplus = incomeTotal.minus(expenseTotal);
    return {
      organizationId: orgId,
      currency: org.currency,
      from: from.toISOString(),
      to: to.toISOString(),
      income: { accounts: income, total: Number(incomeTotal.toFixed(2)) },
      expenses: { accounts: expenses, total: Number(expenseTotal.toFixed(2)) },
      netSurplus: Number(netSurplus.toFixed(2)),
      generatedAt: new Date().toISOString(),
    };
  }

  // ============================================================
  // Balance Sheet (snapshot as of a date)
  // ============================================================
  async balanceSheet(orgId: string, asOf: Date): Promise<BalanceSheet> {
    const [org, accounts, entries] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { currency: true } }),
      this.prisma.gLAccount.findMany({
        where: { organizationId: orgId, isActive: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.journalEntry.findMany({
        where: { organizationId: orgId, postedAt: { not: null }, date: { lte: asOf } },
        select: { lines: true },
      }),
    ]);

    const totals = this.aggregateJournalLines(entries);

    const assets: AccountSummary[] = [];
    const liabilities: AccountSummary[] = [];
    const equity: AccountSummary[] = [];
    let assetsTotal = new Decimal(0);
    let liabilitiesTotal = new Decimal(0);
    let equityTotal = new Decimal(0);
    // Compute retained surplus = sum of all income - sum of all expenses up to asOf
    let cumulativeSurplus = new Decimal(0);

    for (const acct of accounts) {
      const t = totals[acct.id] ?? { debit: new Decimal(0), credit: new Decimal(0) };
      if (acct.type === 'asset') {
        const bal = t.debit.minus(t.credit);
        assets.push({
          id: acct.id, code: acct.code, name: acct.name, type: 'asset',
          debit: Number(t.debit.toFixed(2)),
          credit: Number(t.credit.toFixed(2)),
          balance: Number(bal.toFixed(2)),
        });
        assetsTotal = assetsTotal.add(bal);
      } else if (acct.type === 'liability') {
        const bal = t.credit.minus(t.debit);
        liabilities.push({
          id: acct.id, code: acct.code, name: acct.name, type: 'liability',
          debit: Number(t.debit.toFixed(2)),
          credit: Number(t.credit.toFixed(2)),
          balance: Number(bal.toFixed(2)),
        });
        liabilitiesTotal = liabilitiesTotal.add(bal);
      } else if (acct.type === 'equity') {
        const bal = t.credit.minus(t.debit);
        equity.push({
          id: acct.id, code: acct.code, name: acct.name, type: 'equity',
          debit: Number(t.debit.toFixed(2)),
          credit: Number(t.credit.toFixed(2)),
          balance: Number(bal.toFixed(2)),
        });
        equityTotal = equityTotal.add(bal);
      } else if (acct.type === 'income') {
        cumulativeSurplus = cumulativeSurplus.add(t.credit.minus(t.debit));
      } else if (acct.type === 'expense') {
        cumulativeSurplus = cumulativeSurplus.minus(t.debit.minus(t.credit));
      }
    }

    const retainedSurplus = Number(cumulativeSurplus.toFixed(2));
    const totalLE = equityTotal.add(cumulativeSurplus).add(liabilitiesTotal);
    const balanced = Math.abs(assetsTotal.minus(totalLE).toNumber()) <= 0.01;

    return {
      organizationId: orgId,
      currency: org.currency,
      asOf: asOf.toISOString(),
      assets: { accounts: assets, total: Number(assetsTotal.toFixed(2)) },
      liabilities: { accounts: liabilities, total: Number(liabilitiesTotal.toFixed(2)) },
      equity: { accounts: equity, total: Number(equityTotal.toFixed(2)) },
      retainedSurplus,
      totalLiabilitiesAndEquity: Number(totalLE.toFixed(2)),
      balanced,
      generatedAt: new Date().toISOString(),
    };
  }

  // ============================================================
  // Cash Flow Statement (operating / investing / financing)
  // ============================================================
  async cashFlow(orgId: string, from: Date, to: Date): Promise<CashFlowStatement> {
    if (from > to) throw new BadRequestException('from must be <= to');

    const [org, cashAccounts, allEntries, priorEntries] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { currency: true } }),
      this.prisma.gLAccount.findMany({
        where: { organizationId: orgId, type: 'asset', isActive: true, code: { startsWith: '10' } },
        orderBy: { code: 'asc' },
      }),
      this.prisma.journalEntry.findMany({
        where: { organizationId: orgId, postedAt: { not: null }, date: { gte: from, lte: to } },
        select: { date: true, lines: true },
      }),
      this.prisma.journalEntry.findMany({
        where: { organizationId: orgId, postedAt: { not: null }, date: { lt: from } },
        select: { lines: true },
      }),
    ]);

    const cashIds = new Set(cashAccounts.map((a) => a.id));
    if (cashIds.size === 0) {
      // No bank accounts defined yet — return zeros so report is still well-formed.
      return {
        organizationId: orgId,
        currency: org.currency,
        from: from.toISOString(),
        to: to.toISOString(),
        operating: { inflows: 0, outflows: 0, net: 0, categories: [] },
        investing: { inflows: 0, outflows: 0, net: 0, categories: [] },
        financing: { inflows: 0, outflows: 0, net: 0, categories: [] },
        netChange: 0,
        openingCash: 0,
        closingCash: 0,
        generatedAt: new Date().toISOString(),
      };
    }

    // Opening cash = cumulative cash-account balance up to (but not including) `from`
    let openingCash = new Decimal(0);
    for (const entry of priorEntries) {
      const lines = Array.isArray(entry.lines) ? entry.lines : [];
      for (const line of lines as any[]) {
        if (line && cashIds.has(line.glAccountId)) {
          openingCash = openingCash.add(new Decimal(line.debit ?? 0)).minus(new Decimal(line.credit ?? 0));
        }
      }
    }

    // Pull the linked GL account types so we can classify operating/investing/financing
    const allLinkedIds = new Set<string>();
    for (const entry of allEntries) {
      const lines = Array.isArray(entry.lines) ? entry.lines : [];
      for (const line of lines as any[]) {
        if (line?.glAccountId) allLinkedIds.add(line.glAccountId);
      }
    }
    const linkedAccounts = await this.prisma.gLAccount.findMany({
      where: { id: { in: Array.from(allLinkedIds) } },
      select: { id: true, code: true, name: true, type: true },
    });
    const acctById = new Map(linkedAccounts.map((a) => [a.id, a]));

    // For each cash-touching journal entry, the cash side classifies the activity:
    //   cash debited (inflow) + offsetting credit on income → operating
    //   cash credited (outflow) + offsetting debit on expense → operating
    //   cash + asset (non-cash) → investing
    //   cash + equity / long-term liability → financing
    // Categorize against the "other side" account type.
    const categories = {
      operating: new Map<string, CashCategory>(),
      investing: new Map<string, CashCategory>(),
      financing: new Map<string, CashCategory>(),
    };

    const addToCategory = (
      bucket: Map<string, CashCategory>,
      acctId: string,
      acctCode: string,
      acctName: string,
      amount: Decimal,
    ) => {
      const cur = bucket.get(acctId) ?? { accountId: acctId, code: acctCode, name: acctName, inflows: 0, outflows: 0, net: 0 };
      if (amount.greaterThan(0)) cur.inflows += Number(amount.toFixed(2));
      else cur.outflows += Number(amount.abs().toFixed(2));
      cur.net += Number(amount.toFixed(2));
      bucket.set(acctId, cur);
    };

    for (const entry of allEntries) {
      const lines = (Array.isArray(entry.lines) ? entry.lines : []) as any[];
      let cashNet = new Decimal(0);
      const counterparts: Array<{ acctId: string; amount: Decimal }> = [];
      for (const l of lines) {
        if (!l || !l.glAccountId) continue;
        const d = new Decimal(l.debit ?? 0);
        const c = new Decimal(l.credit ?? 0);
        if (cashIds.has(l.glAccountId)) {
          cashNet = cashNet.add(d).minus(c);
        } else {
          counterparts.push({ acctId: l.glAccountId, amount: d.minus(c) });
        }
      }
      if (cashNet.isZero()) continue;
      // Allocate cash impact across counterparts proportionally to magnitude.
      const totalMag = counterparts.reduce((s, x) => s.add(x.amount.abs()), new Decimal(0));
      if (totalMag.isZero()) continue;
      for (const cp of counterparts) {
        const acct = acctById.get(cp.acctId);
        if (!acct) continue;
        const share = cp.amount.abs().div(totalMag);
        const cashShare = cashNet.times(share);
        // cashNet > 0 means cash debit (inflow); < 0 means cash credit (outflow)
        const bucket = this.classifyActivity(acct.type);
        addToCategory(
          categories[bucket],
          acct.id,
          acct.code,
          acct.name,
          cashShare,
        );
      }
    }

    const collapse = (m: Map<string, CashCategory>) => {
      const cats = Array.from(m.values()).sort((a, b) => a.code.localeCompare(b.code));
      const inflows = cats.reduce((s, c) => s + c.inflows, 0);
      const outflows = cats.reduce((s, c) => s + c.outflows, 0);
      return { inflows: round2(inflows), outflows: round2(outflows), net: round2(inflows - outflows), categories: cats };
    };

    const operating = collapse(categories.operating);
    const investing = collapse(categories.investing);
    const financing = collapse(categories.financing);

    const netChange = operating.net + investing.net + financing.net;

    return {
      organizationId: orgId,
      currency: org.currency,
      from: from.toISOString(),
      to: to.toISOString(),
      operating,
      investing,
      financing,
      netChange: round2(netChange),
      openingCash: Number(openingCash.toFixed(2)),
      closingCash: round2(Number(openingCash.toFixed(2)) + netChange),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Bundle Income Statement + Balance Sheet + Cash Flow for a "board pack" view.
   * The PDF assembly happens on the frontend via print-optimized layouts.
   */
  async boardPack(orgId: string, from: Date, to: Date) {
    const [income, balance, cash] = await Promise.all([
      this.incomeStatement(orgId, from, to),
      this.balanceSheet(orgId, to),
      this.cashFlow(orgId, from, to),
    ]);
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { name: true, logoUrl: true, currency: true },
    });
    return { organization: org, period: { from: from.toISOString(), to: to.toISOString() }, income, balance, cash };
  }

  // ============================================================
  // Helpers
  // ============================================================

  /** Aggregate journal lines into per-account debit/credit totals. */
  private aggregateJournalLines(entries: Array<{ lines: any }>): Record<string, LineTotals> {
    const out: Record<string, LineTotals> = {};
    for (const entry of entries) {
      const lines = Array.isArray(entry.lines) ? entry.lines : [];
      for (const line of lines as any[]) {
        if (!line || !line.glAccountId) continue;
        const id = line.glAccountId;
        if (!out[id]) out[id] = { debit: new Decimal(0), credit: new Decimal(0) };
        out[id].debit = out[id].debit.add(new Decimal(line.debit ?? 0));
        out[id].credit = out[id].credit.add(new Decimal(line.credit ?? 0));
      }
    }
    return out;
  }

  /** Classify a counterpart account type into a cash-flow activity bucket. */
  private classifyActivity(t: string): 'operating' | 'investing' | 'financing' {
    switch (t) {
      case 'income':
      case 'expense':
        return 'operating';
      case 'asset':
        return 'investing';
      case 'equity':
      case 'liability':
        return 'financing';
      default:
        return 'operating';
    }
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
