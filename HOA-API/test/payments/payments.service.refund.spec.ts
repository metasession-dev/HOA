import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentsService } from '../../src/payments/payments.service';

const D = (n: number) => new Decimal(n);

/**
 * In-memory stand-in for the slice of Prisma `refundByReference` touches.
 * Payment p1 (250 NGN) is allocated 100 to each of inv1 (Jan) and inv2 (Feb),
 * with 50 left as unallocated credit.
 */
function setup() {
  const db: any = {
    invoices: {
      inv1: { id: 'inv1', amount: D(100), amountPaid: D(100), status: 'paid', paidAt: new Date(), dueDate: new Date('2026-01-01') },
      inv2: { id: 'inv2', amount: D(100), amountPaid: D(100), status: 'paid', paidAt: new Date(), dueDate: new Date('2026-02-01') },
    },
    payment: {
      id: 'p1', organizationId: 'o1', processorReference: 'hoa_x', status: 'completed', currency: 'NGN',
      amount: D(250), amountUnallocated: D(50), amountRefunded: D(0),
    },
    allocations: [
      { id: 'a1', paymentId: 'p1', invoiceId: 'inv1', amount: D(100) },
      { id: 'a2', paymentId: 'p1', invoiceId: 'inv2', amount: D(100) },
    ],
    refunds: [] as any[],
    audits: [] as any[],
  };
  const tx: any = {
    $queryRaw: async () => [],
    payment: {
      findFirst: async () =>
        db.payment.status === 'completed'
          ? { ...db.payment, allocations: db.allocations.map((a: any) => ({ ...a, invoice: { dueDate: db.invoices[a.invoiceId].dueDate } })) }
          : null,
      update: async ({ data }: any) => Object.assign(db.payment, data),
    },
    paymentRefund: {
      findUnique: async ({ where }: any) =>
        db.refunds.find((r: any) => r.providerRefundId === where.organizationId_providerRefundId.providerRefundId) ?? null,
      create: async ({ data }: any) => { db.refunds.push(data); return data; },
    },
    invoice: {
      findUnique: async ({ where }: any) => ({ ...db.invoices[where.id] }),
      update: async ({ where, data }: any) => Object.assign(db.invoices[where.id], data),
    },
    paymentAllocation: {
      delete: async ({ where }: any) => { db.allocations = db.allocations.filter((a: any) => a.id !== where.id); },
      update: async ({ where, data }: any) => Object.assign(db.allocations.find((a: any) => a.id === where.id), data),
    },
    auditLog: { create: async ({ data }: any) => db.audits.push(data) },
  };
  const prisma: any = { $transaction: (fn: any) => fn(tx) };
  const service = new PaymentsService(prisma, {} as any, {} as any, {} as any, {} as any);
  return { db, service };
}

const refund = (amount: number, providerRefundId: string, currency = 'NGN') => ({ amount, currency, providerRefundId });

describe('PaymentsService.refundByReference', () => {
  it('applies a partial refund to credit first, then the newest invoice', async () => {
    const { db, service } = setup();

    await service.refundByReference('o1', 'hoa_x', refund(120, 'r1'));

    expect(db.payment.status).toBe('completed');
    expect(db.payment.amountRefunded.toString()).toBe('120');
    expect(db.payment.amountUnallocated.toString()).toBe('0');
    // 50 came off credit, the other 70 off inv2 (newest due date).
    expect(db.invoices.inv2.amountPaid.toString()).toBe('30');
    expect(db.invoices.inv2.status).toBe('partial');
    expect(db.invoices.inv1.amountPaid.toString()).toBe('100');
    expect(db.invoices.inv1.status).toBe('paid');
    expect(db.allocations.find((a: any) => a.id === 'a2').amount.toString()).toBe('30');
    expect(db.audits.at(-1).action).toBe('payment_partially_refunded');
  });

  it('ignores a replayed refund with the same Paystack refund id', async () => {
    const { db, service } = setup();

    await service.refundByReference('o1', 'hoa_x', refund(120, 'r1'));
    await service.refundByReference('o1', 'hoa_x', refund(120, 'r1'));

    expect(db.payment.amountRefunded.toString()).toBe('120');
    expect(db.refunds).toHaveLength(1);
  });

  it('rejects a refund in a different currency', async () => {
    const { db, service } = setup();

    await expect(service.refundByReference('o1', 'hoa_x', refund(10, 'r9', 'USD'))).rejects.toBeInstanceOf(BadRequestException);
    expect(db.payment.amountRefunded.toString()).toBe('0');
  });

  it('caps an over-sized refund and reverses the payment once fully refunded', async () => {
    const { db, service } = setup();

    await service.refundByReference('o1', 'hoa_x', refund(120, 'r1'));
    await service.refundByReference('o1', 'hoa_x', refund(999, 'r2'));

    expect(db.payment.status).toBe('reversed');
    expect(db.payment.amountRefunded.toString()).toBe('250');
    expect(db.refunds[1].amount.toString()).toBe('130');
    expect(db.invoices.inv1.status).toBe('sent');
    expect(db.invoices.inv2.status).toBe('sent');
    expect(db.invoices.inv1.paidAt).toBeNull();
    expect(db.allocations).toHaveLength(0);
    expect(db.audits.at(-1).action).toBe('payment_reversed');
  });

  it('returns null when no completed payment matches the reference', async () => {
    const { db, service } = setup();
    db.payment.status = 'reversed';

    await expect(service.refundByReference('o1', 'hoa_x', refund(10, 'r1'))).resolves.toBeNull();
  });
});
