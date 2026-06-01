import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../common/prisma.service';

export type FinancialSnapshot = {
  unitId: string;
  asOf: string;
  totalLevied: number;
  totalPaid: number;
  balance: number;
  currency: string;
  invoices: Array<{
    id: string;
    reference: string;
    issueDate: string;
    dueDate: string;
    amount: number;
    status: string;
    notes: string;
  }>;
  payments: Array<{
    id: string;
    invoiceId: string;
    reference: string;
    receivedDate: string;
    amount: number;
    method: string;
    status: string;
  }>;
};

@Injectable()
export class SnapshotService {
  constructor(private prisma: PrismaService) {}

  /**
   * Capture a full unit financial snapshot. Used by ResaleCertificate.
   * Frozen JSON once the certificate is issued, regenerable while in draft.
   */
  async forUnit(
    unitId: string,
    orgId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<FinancialSnapshot> {
    const client = tx ?? this.prisma;

    const unit = await client.unit.findFirst({
      where: { id: unitId, estate: { organizationId: orgId } },
      include: { estate: { include: { organization: { select: { currency: true } } } } },
    });
    if (!unit) throw new Error('Unit not found');

    const currency = unit.estate.organization.currency || 'ZAR';

    const invoices = await client.invoice.findMany({
      where: { unitId, organizationId: orgId },
      orderBy: { createdAt: 'asc' },
      include: {
        payments: {
          where: { status: { not: 'failed' } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    let totalLevied = new Decimal(0);
    let totalPaid = new Decimal(0);
    const allPayments: FinancialSnapshot['payments'] = [];
    for (const inv of invoices) {
      totalLevied = totalLevied.add(inv.amount);
      for (const p of inv.payments) {
        totalPaid = totalPaid.add(p.amount);
        allPayments.push({
          id: p.id,
          invoiceId: p.invoiceId ?? inv.id,
          reference: p.processorReference ?? '',
          receivedDate: (p.processedAt ?? p.createdAt).toISOString(),
          amount: Number(p.amount.toString()),
          method: p.method,
          status: p.status,
        });
      }
    }
    const balance = totalLevied.minus(totalPaid);

    return {
      unitId,
      asOf: new Date().toISOString(),
      totalLevied: Number(totalLevied.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
      balance: Number(balance.toFixed(2)),
      currency,
      invoices: invoices.map((i) => ({
        id: i.id,
        reference: i.invoiceNumber,
        issueDate: i.createdAt.toISOString(),
        dueDate: i.dueDate.toISOString(),
        amount: Number(i.amount.toString()),
        status: i.status,
        notes: i.notes ?? '',
      })),
      payments: allPayments,
    };
  }
}
