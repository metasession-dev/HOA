import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';
import { CategorizationRulesService } from './categorization-rules.service';
import {
  ImportTransactionsDto,
  MatchTransactionDto,
  StartReconciliationDto,
} from './dto/banking.dto';

export type Actor = { userId: string; role: string };

@Injectable()
export class BankTransactionsService {
  constructor(
    private prisma: PrismaService,
    private categorization: CategorizationRulesService,
  ) {}

  async list(
    bankAccountId: string,
    orgId: string,
    query: { status?: string; from?: string; to?: string; search?: string },
  ) {
    // Verify ownership
    const acct = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId: orgId },
    });
    if (!acct) throw new NotFoundException('Bank account not found');

    const where: Prisma.BankTransactionWhereInput = { bankAccountId };
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to);
    }
    if (query.search) {
      where.OR = [
        { description: { contains: query.search, mode: 'insensitive' } },
        { reference: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.bankTransaction.findMany({
      where,
      include: { glAccount: { select: { id: true, code: true, name: true } } },
      orderBy: { date: 'desc' },
    });
  }

  async import(bankAccountId: string, orgId: string, actor: Actor, dto: ImportTransactionsDto) {
    const acct = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId: orgId, isActive: true },
    });
    if (!acct) throw new NotFoundException('Bank account not found or inactive');
    if (dto.transactions.length === 0) {
      throw new BadRequestException('No transactions provided');
    }
    if (dto.transactions.length > 1000) {
      throw new BadRequestException('Batch limited to 1000 transactions');
    }

    // Reject any transaction whose date falls inside a locked reconciliation
    // period — backdating into closed books is a financial-integrity violation.
    const lockedRecons = await this.prisma.bankReconciliation.findMany({
      where: { bankAccountId, status: 'locked' },
      select: { periodStart: true, periodEnd: true, id: true },
    });
    if (lockedRecons.length > 0) {
      for (const raw of dto.transactions) {
        const d = new Date(raw.date);
        for (const lr of lockedRecons) {
          if (d >= lr.periodStart && d <= lr.periodEnd) {
            throw new ConflictException(
              `Transaction dated ${raw.date} falls inside a locked reconciliation period (${lr.periodStart.toISOString().slice(0, 10)} – ${lr.periodEnd.toISOString().slice(0, 10)})`,
            );
          }
        }
      }
    }

    const rules = await this.prisma.categorizationRule.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { priority: 'asc' },
    });

    return this.prisma.$transaction(async (tx) => {
      let imported = 0;
      let skippedDuplicates = 0;
      let autoCategorized = 0;

      for (const raw of dto.transactions) {
        if (raw.externalId) {
          const exists = await tx.bankTransaction.findUnique({
            where: { bankAccountId_externalId: { bankAccountId, externalId: raw.externalId } },
          });
          if (exists) {
            skippedDuplicates++;
            continue;
          }
        }
        const amount = new Decimal(raw.amount);
        const match = this.categorization.matchTransaction(rules as any[], {
          description: raw.description,
          amount,
        });
        if (match) {
          autoCategorized++;
          await tx.categorizationRule.update({
            where: { id: match.ruleId },
            data: { hits: { increment: 1 } },
          });
        }
        await tx.bankTransaction.create({
          data: {
            bankAccountId,
            externalId: raw.externalId,
            date: new Date(raw.date),
            amount,
            description: raw.description,
            reference: raw.reference,
            rawPayload: raw.rawPayload ?? Prisma.JsonNull,
            glAccountId: match?.glAccountId,
            source: dto.source ?? 'manual',
          },
        });
        imported++;
      }

      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: { lastSyncAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'transactions_imported',
          entityType: 'BankAccount',
          entityId: bankAccountId,
          changes: { imported, skippedDuplicates, autoCategorized, source: dto.source } as any,
        },
      });

      return { imported, skippedDuplicates, autoCategorized };
    });
  }

  /**
   * Suggest a match for an unmatched bank transaction.
   *
   * Priority:
   * 1. Exact-amount Payment within ±3 days (high confidence)
   * 2. Exact-amount VendorInvoice within ±7 days (medium confidence)
   * 3. Fuzzy reference text overlap (low confidence)
   */
  async suggestMatches(transactionId: string, orgId: string) {
    const txn = await this.findTxnOwned(transactionId, orgId);
    if (txn.status !== 'unmatched') {
      throw new ConflictException('Transaction already matched or excluded');
    }
    const amount = new Decimal(txn.amount.toString());
    const isInflow = amount.greaterThan(0);
    const absAmount = amount.abs();
    const start = new Date(txn.date.getTime() - 3 * 86400000);
    const end = new Date(txn.date.getTime() + 3 * 86400000);

    const suggestions: Array<{
      entityType: string;
      entityId: string;
      label: string;
      confidence: 'high' | 'medium' | 'low';
      amount: number;
      date: string;
      reason: string;
    }> = [];

    if (isInflow) {
      // Match against completed Payments
      const candidatePayments = await this.prisma.payment.findMany({
        where: {
          status: 'completed',
          amount: absAmount,
          processedAt: { gte: start, lte: end },
          invoice: { organizationId: orgId, unit: { estate: { organizationId: orgId } } },
        },
        include: { invoice: { include: { unit: true } } },
        take: 10,
      });
      for (const p of candidatePayments) {
        suggestions.push({
          entityType: 'Payment',
          entityId: p.id,
          label: `Payment on invoice ${p.invoice?.invoiceNumber ?? '—'} (Unit ${p.invoice?.unit?.unitNumber ?? '—'})`,
          confidence: 'high',
          amount: Number(p.amount.toString()),
          date: (p.processedAt ?? p.createdAt).toISOString(),
          reason: 'Exact amount match within 3-day window',
        });
      }
    } else {
      // Outflow: match against approved/paid VendorInvoices
      const wider = new Date(txn.date.getTime() + 7 * 86400000);
      const candidateInvoices = await this.prisma.vendorInvoice.findMany({
        where: {
          organizationId: orgId,
          amount: absAmount,
          status: { in: ['approved', 'paid'] },
          OR: [
            { issueDate: { gte: start, lte: wider } },
            { dueDate: { gte: start, lte: wider } },
            { paidAt: { gte: start, lte: wider } },
          ],
        },
        include: { vendor: true },
        take: 10,
      });
      for (const inv of candidateInvoices) {
        const matchesRef = inv.paymentReference && txn.reference && txn.reference.includes(inv.paymentReference);
        suggestions.push({
          entityType: 'VendorInvoice',
          entityId: inv.id,
          label: `Vendor invoice ${inv.vendorInvoiceNo} (${inv.vendor.name})`,
          confidence: matchesRef ? 'high' : 'medium',
          amount: Number(inv.amount.toString()),
          date: (inv.paidAt ?? inv.dueDate).toISOString(),
          reason: matchesRef
            ? 'Exact amount + reference match'
            : 'Exact amount within 7-day window',
        });
      }
    }

    return { transaction: txn, suggestions };
  }

  async match(transactionId: string, orgId: string, actor: Actor, dto: MatchTransactionDto) {
    return this.prisma.$transaction(async (tx) => {
      const txn = await tx.bankTransaction.findFirst({
        where: { id: transactionId, bankAccount: { organizationId: orgId } },
        include: { bankAccount: true },
      });
      if (!txn) throw new NotFoundException('Bank transaction not found');
      if (txn.status !== 'unmatched') {
        throw new ConflictException(`Cannot match transaction in status ${txn.status}`);
      }

      let resolvedGlAccountId = dto.glAccountId ?? txn.glAccountId;

      // Resolve the entity into a GL account if it's a known model
      if (dto.entityType === 'Payment' && dto.entityId) {
        const p = await tx.payment.findFirst({
          where: { id: dto.entityId, invoice: { organizationId: orgId } },
          include: { invoice: true },
        });
        if (!p) throw new NotFoundException('Payment not found');
        // Money received → credit "Accounts Receivable - Levies" (code 1020 typically)
        const arGl = await tx.gLAccount.findFirst({
          where: { organizationId: orgId, code: '1020' },
        });
        resolvedGlAccountId = arGl?.id ?? resolvedGlAccountId;
      } else if (dto.entityType === 'VendorInvoice' && dto.entityId) {
        const inv = await tx.vendorInvoice.findFirst({
          where: { id: dto.entityId, organizationId: orgId },
        });
        if (!inv) throw new NotFoundException('Vendor invoice not found');
        // Money paid → debit "Accounts Payable" (code 2000 typically)
        const apGl = await tx.gLAccount.findFirst({
          where: { organizationId: orgId, code: '2000' },
        });
        resolvedGlAccountId = inv.glAccountId ?? apGl?.id ?? resolvedGlAccountId;
      } else if (dto.entityType === 'Manual') {
        if (!dto.glAccountId) {
          throw new BadRequestException('Manual match requires a glAccountId');
        }
        const gl = await tx.gLAccount.findFirst({
          where: { id: dto.glAccountId, organizationId: orgId, isActive: true },
        });
        if (!gl) throw new BadRequestException('Invalid GL account');
        resolvedGlAccountId = gl.id;
      }

      if (!resolvedGlAccountId) {
        throw new BadRequestException(
          'No GL account resolved. Set glAccountId or pick a matchable entity.',
        );
      }

      // Create a journal entry that mirrors the bank movement
      const reference = `BANK-${txn.bankAccount.name}-${txn.id.slice(-8)}`;
      const amount = new Decimal(txn.amount.toString());
      const lines = amount.greaterThan(0)
        ? [
            { glAccountId: txn.bankAccount.glAccountId, debit: Number(amount.toFixed(2)), credit: 0 },
            { glAccountId: resolvedGlAccountId, debit: 0, credit: Number(amount.toFixed(2)) },
          ]
        : [
            { glAccountId: resolvedGlAccountId, debit: Number(amount.abs().toFixed(2)), credit: 0 },
            { glAccountId: txn.bankAccount.glAccountId, debit: 0, credit: Number(amount.abs().toFixed(2)) },
          ];

      // Assert double-entry balance before posting — keeps the ledger sane even
      // if this code is later edited to produce more complex multi-line splits.
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new BadRequestException(
          `Refusing to post unbalanced JE: debit ${totalDebit} ≠ credit ${totalCredit}`,
        );
      }

      const je = await tx.journalEntry.create({
        data: {
          organizationId: orgId,
          date: txn.date,
          reference,
          description: `Reconciliation: ${txn.description}${dto.notes ? ` — ${dto.notes}` : ''}`,
          lines: lines as any,
          createdBy: actor.userId,
          postedAt: new Date(),
        },
      });

      const updated = await tx.bankTransaction.update({
        where: { id: transactionId },
        data: {
          status: 'matched',
          matchedEntityType: dto.entityType,
          matchedEntityId: dto.entityId ?? null,
          matchedJournalEntryId: je.id,
          matchedAt: new Date(),
          matchedBy: actor.userId,
          glAccountId: resolvedGlAccountId,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'matched',
          entityType: 'BankTransaction',
          entityId: transactionId,
          changes: { entityType: dto.entityType, entityId: dto.entityId, glAccountId: resolvedGlAccountId, journalEntryId: je.id } as any,
        },
      });

      return updated;
    });
  }

  async exclude(transactionId: string, orgId: string, actor: Actor, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const txn = await tx.bankTransaction.findFirst({
        where: { id: transactionId, bankAccount: { organizationId: orgId } },
      });
      if (!txn) throw new NotFoundException('Bank transaction not found');
      if (txn.status === 'excluded') return txn;
      if (txn.status === 'matched') {
        throw new ConflictException('Cannot exclude a matched transaction. Unmatch it first.');
      }
      const updated = await tx.bankTransaction.update({
        where: { id: transactionId },
        data: { status: 'excluded' },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'excluded',
          entityType: 'BankTransaction',
          entityId: transactionId,
          changes: { reason } as any,
        },
      });
      return updated;
    });
  }

  async unmatch(transactionId: string, orgId: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const txn = await tx.bankTransaction.findFirst({
        where: { id: transactionId, bankAccount: { organizationId: orgId } },
      });
      if (!txn) throw new NotFoundException('Bank transaction not found');
      if (txn.status !== 'matched') {
        throw new ConflictException(`Cannot unmatch transaction in status ${txn.status}`);
      }
      // Check the reconciliation isn't locked
      const lockedRecon = await tx.bankReconciliation.findFirst({
        where: {
          bankAccountId: txn.bankAccountId,
          status: 'locked',
          periodStart: { lte: txn.date },
          periodEnd: { gte: txn.date },
        },
      });
      if (lockedRecon) {
        throw new ConflictException('Transaction is inside a locked reconciliation period');
      }

      // Ledger immutability: do NOT delete the original posted JE. Post a
      // reversing JE that flips debits and credits, dated today. This preserves
      // the original entry in the audit trail and any historical reports that
      // included it.
      let reversingJeId: string | null = null;
      let originalJe: { id: string; reference: string; lines: any } | null = null;
      if (txn.matchedJournalEntryId) {
        // Org-scope the lookup defensively (issue #1)
        const found = await tx.journalEntry.findFirst({
          where: { id: txn.matchedJournalEntryId, organizationId: orgId },
        });
        if (found) {
          originalJe = { id: found.id, reference: found.reference, lines: found.lines };
          const reversedLines = (Array.isArray(found.lines) ? found.lines : []).map((l: any) => ({
            glAccountId: l.glAccountId,
            debit: Number(l.credit ?? 0),
            credit: Number(l.debit ?? 0),
            notes: 'Reversing entry',
            ...(l.fundId ? { fundId: l.fundId } : {}),
          }));
          const reversingJe = await tx.journalEntry.create({
            data: {
              organizationId: orgId,
              date: new Date(),
              reference: `REV-${found.reference}`,
              description: `Reversal of ${found.reference} (bank txn unmatched)`,
              lines: reversedLines as any,
              fundId: found.fundId,
              createdBy: actor.userId,
              postedAt: new Date(),
            },
          });
          reversingJeId = reversingJe.id;
        }
      }

      const updated = await tx.bankTransaction.update({
        where: { id: transactionId },
        data: {
          status: 'unmatched',
          matchedEntityType: null,
          matchedEntityId: null,
          matchedJournalEntryId: null,
          matchedAt: null,
          matchedBy: null,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'unmatched',
          entityType: 'BankTransaction',
          entityId: transactionId,
          changes: {
            previousMatch: `${txn.matchedEntityType}:${txn.matchedEntityId ?? ''}`,
            originalJournalEntry: originalJe,
            reversingJournalEntryId: reversingJeId,
            amount: Number(txn.amount.toString()),
            txnReference: txn.reference,
          } as any,
        },
      });
      return updated;
    });
  }

  /** Start (or fetch) a reconciliation for a period. */
  async startReconciliation(
    bankAccountId: string,
    orgId: string,
    actor: Actor,
    dto: StartReconciliationDto,
  ) {
    const acct = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId: orgId },
    });
    if (!acct) throw new NotFoundException('Bank account not found');

    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodEnd < periodStart) throw new BadRequestException('periodEnd before periodStart');

    // Opening balance: opening account balance + transactions before periodStart
    const priorSum = await this.prisma.bankTransaction.aggregate({
      where: { bankAccountId, date: { lt: periodStart } },
      _sum: { amount: true },
    });
    const opening = new Decimal(acct.openingBalance.toString()).add(new Decimal(priorSum._sum.amount?.toString() ?? '0'));

    const periodSum = await this.prisma.bankTransaction.aggregate({
      where: { bankAccountId, date: { gte: periodStart, lte: periodEnd } },
      _sum: { amount: true },
    });
    const closing = opening.add(new Decimal(periodSum._sum.amount?.toString() ?? '0'));

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const r = await tx.bankReconciliation.create({
          data: {
            organizationId: orgId,
            bankAccountId,
            periodStart,
            periodEnd,
            openingBalance: opening,
            closingBalance: closing,
            statementBalance: new Decimal(dto.statementBalance),
            notes: dto.notes,
            createdBy: actor.userId,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorId: actor.userId,
            actorRole: actor.role,
            action: 'reconciliation_started',
            entityType: 'BankReconciliation',
            entityId: r.id,
            changes: { periodStart, periodEnd, opening, closing, statement: dto.statementBalance } as any,
          },
        });
        return r;
      });
      return created;
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('A reconciliation for this period already exists');
      }
      throw err;
    }
  }

  async listReconciliations(bankAccountId: string, orgId: string) {
    const acct = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId: orgId },
    });
    if (!acct) throw new NotFoundException('Bank account not found');
    return this.prisma.bankReconciliation.findMany({
      where: { bankAccountId },
      orderBy: { periodEnd: 'desc' },
    });
  }

  async lockReconciliation(reconciliationId: string, orgId: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.bankReconciliation.findFirst({
        where: { id: reconciliationId, organizationId: orgId },
      });
      if (!r) throw new NotFoundException('Reconciliation not found');
      if (r.status === 'locked') return r;

      // Refuse to lock if any unmatched transactions remain in period
      const unmatchedCount = await tx.bankTransaction.count({
        where: {
          bankAccountId: r.bankAccountId,
          date: { gte: r.periodStart, lte: r.periodEnd },
          status: 'unmatched',
        },
      });
      if (unmatchedCount > 0) {
        throw new ConflictException(
          `Cannot lock reconciliation: ${unmatchedCount} transaction(s) still unmatched in period`,
        );
      }

      // Refuse to lock if statement balance doesn't match closing balance
      const closing = new Decimal(r.closingBalance.toString());
      const statement = new Decimal(r.statementBalance.toString());
      if (closing.minus(statement).abs().greaterThan(new Decimal('0.01'))) {
        throw new ConflictException(
          `Closing balance ${closing.toFixed(2)} does not match statement ${statement.toFixed(2)} (variance ${closing.minus(statement).toFixed(2)})`,
        );
      }

      // Atomic transition: updateMany scoped by id + status='open' so two
      // concurrent locks can't both succeed. PostgreSQL READ COMMITTED is enough
      // here because the WHERE clause guarantees the update only applies if the
      // row is still 'open'.
      const result = await tx.bankReconciliation.updateMany({
        where: { id: reconciliationId, status: 'open' },
        data: { status: 'locked', lockedAt: new Date(), lockedBy: actor.userId },
      });
      if (result.count === 0) {
        throw new ConflictException('Reconciliation was locked by another user');
      }

      const updated = await tx.bankReconciliation.findUniqueOrThrow({ where: { id: reconciliationId } });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'reconciliation_locked',
          entityType: 'BankReconciliation',
          entityId: reconciliationId,
          changes: { periodStart: r.periodStart, periodEnd: r.periodEnd, closingBalance: Number(closing.toFixed(2)) } as any,
        },
      });
      return updated;
    });
  }

  private async findTxnOwned(id: string, orgId: string) {
    const t = await this.prisma.bankTransaction.findFirst({
      where: { id, bankAccount: { organizationId: orgId } },
    });
    if (!t) throw new NotFoundException('Bank transaction not found');
    return t;
  }
}
