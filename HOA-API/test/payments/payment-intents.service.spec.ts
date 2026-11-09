import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentIntentsService } from '../../src/payments/payment-intents.service';
import { PaystackService } from '../../src/payments/paystack.service';
import { withEnv } from '../helpers/env';

const D = (n: number) => new Decimal(n);
const tenant = { userId: 'res1', role: 'tenant' } as any;
const sign = (body: string, key: string) => crypto.createHmac('sha512', key).update(body).digest('hex');

function make(deps: { prisma?: any; paystack?: any; payments?: any; config?: any; unitBilling?: any } = {}) {
  return new PaymentIntentsService(
    deps.prisma ?? ({} as any),
    deps.paystack ?? ({} as any),
    deps.payments ?? ({} as any),
    deps.config ?? ({} as any),
    deps.unitBilling ?? ({} as any),
  );
}

const orgCreds = (secretKey: string) => ({ secretKey, publicKey: null, subaccountCode: null, feeBearer: 'account', source: 'org' });

describe('PaymentIntentsService.createMultiInvoiceIntent', () => {
  it('scopes the invoice lookup to units the resident occupies', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = make({ prisma: { invoice: { findMany } } });

    await expect(svc.createMultiInvoiceIntent('o1', tenant, ['i1', 'i2'])).rejects.toThrow(/not found/);

    const where = findMany.mock.calls[0][0].where;
    expect(where.unit.occupancies.some).toMatchObject({ isActive: true, person: { userId: 'res1' } });
  });

  it('refuses the whole checkout if any requested invoice is out of scope', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'i1', amount: D(10), amountPaid: D(0), currency: 'NGN', status: 'sent' }]);
    const svc = make({ prisma: { invoice: { findMany } } });

    await expect(svc.createMultiInvoiceIntent('o1', tenant, ['i1', 'i2'])).rejects.toThrow(/not found/);
  });

  it('refuses paid invoices', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'i1', invoiceNumber: 'INV-1', amount: D(10), amountPaid: D(10), currency: 'NGN', status: 'paid' }]);
    const svc = make({ prisma: { invoice: { findMany } } });

    await expect(svc.createMultiInvoiceIntent('o1', tenant, ['i1'])).rejects.toThrow(/paid invoice/);
  });

  it('refuses invoices in mixed currencies', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'i1', amount: D(10), amountPaid: D(0), currency: 'NGN', status: 'sent' },
      { id: 'i2', amount: D(10), amountPaid: D(0), currency: 'GHS', status: 'sent' },
    ]);
    const svc = make({ prisma: { invoice: { findMany } } });

    await expect(svc.createMultiInvoiceIntent('o1', tenant, ['i1', 'i2'])).rejects.toThrow(/share a currency/);
  });
});

describe('PaymentIntentsService — test-mode keys in production', () => {
  const invoicePrisma = () => ({
    invoice: { findFirst: async () => ({ id: 'i1', status: 'sent', amount: D(100), currency: 'NGN', unitId: 'u', payments: [] }) },
    user: { findUniqueOrThrow: async () => ({ email: 'a@b.c' }) },
  });

  it('refuses to open a checkout with sk_test_ keys in production', async () => {
    const config = { getResolvedCredentials: async () => orgCreds('sk_test_x') };
    const paystack = { initializeTransaction: jest.fn() };
    const svc = make({ prisma: invoicePrisma(), config, paystack });

    await withEnv({ NODE_ENV: 'production' }, () =>
      expect(svc.createIntent('o1', tenant, 'i1')).rejects.toThrow(/test mode/),
    );
    expect(paystack.initializeTransaction).not.toHaveBeenCalled();
  });

  it('refuses to open a checkout with no keys in production', async () => {
    const config = { getResolvedCredentials: async () => null };
    const svc = make({ prisma: invoicePrisma(), config });

    await withEnv({ NODE_ENV: 'production' }, () =>
      expect(svc.createIntent('o1', tenant, 'i1')).rejects.toThrow(/not configured/),
    );
  });

  const pendingIntentPrisma = (onUpdate: (data: any) => void) => ({
    paymentIntent: {
      findUnique: async () => ({
        id: 'pi', status: 'pending', amount: D(100), currency: 'NGN', providerReference: 'hoa_t',
        invoiceId: 'i1', invoiceIds: [], providerMetadata: {}, initiatedByUserId: 'res1', provider: 'paystack', organizationId: 'o1',
      }),
      update: async ({ data }: any) => onUpdate(data),
    },
  });
  const testCharge = { event: 'charge.success', data: { reference: 'hoa_t', status: 'success', amount: 10000, currency: 'NGN', domain: 'test' } };

  it('never settles an invoice from a test-domain charge in production', async () => {
    let updated: any;
    const payments = { logPayment: jest.fn() };
    const svc = make({ prisma: pendingIntentPrisma((d) => (updated = d)), payments });
    jest.spyOn((svc as any).logger, 'error').mockImplementation(() => undefined);

    const result: any = await withEnv({ NODE_ENV: 'production' }, () => svc.handleWebhookEvent(testCharge));

    expect(result.reason).toBe('test-mode-charge');
    expect(updated).toMatchObject({ status: 'failed', failureReason: 'test_mode_charge' });
    expect(payments.logPayment).not.toHaveBeenCalled();
  });

  it('still settles test-domain charges outside production', async () => {
    const payments = { logPayment: jest.fn().mockResolvedValue({}) };
    const svc = make({ prisma: pendingIntentPrisma(() => undefined), payments });

    await withEnv({ NODE_ENV: 'development' }, () => svc.handleWebhookEvent(testCharge));

    expect(payments.logPayment).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'i1', amount: 100, processorReference: 'hoa_t' }),
      'res1',
    );
  });
});

describe('PaymentIntentsService — refund webhooks', () => {
  const refundPrisma = { paymentIntent: { findUnique: async () => ({ organizationId: 'o1' }) } };

  it('passes a partial refund through in major units, keyed by Paystack refund id', async () => {
    const payments = { refundByReference: jest.fn().mockResolvedValue({ id: 'p1' }) };
    const svc = make({ prisma: refundPrisma, payments });

    const result: any = await svc.handleWebhookEvent({
      event: 'refund.processed',
      data: { id: 777, transaction_reference: 'hoa_x', amount: 12050, currency: 'NGN', status: 'processed' },
    });

    expect(result).toMatchObject({ ok: true, refunded: true });
    expect(payments.refundByReference).toHaveBeenCalledWith('o1', 'hoa_x', {
      amount: 120.5, currency: 'NGN', providerRefundId: '777', reason: 'paystack_refund',
    });
  });

  it('ignores a refund event without an amount or id', async () => {
    const payments = { refundByReference: jest.fn() };
    const svc = make({ prisma: refundPrisma, payments });
    jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);

    const result: any = await svc.handleWebhookEvent({ event: 'refund.processed', data: { transaction_reference: 'hoa_x' } });

    expect(result.ignored).toBe(true);
    expect(payments.refundByReference).not.toHaveBeenCalled();
  });

  it('verifies refund webhooks against the owning org secret using transaction_reference', async () => {
    const payments = { refundByReference: jest.fn().mockResolvedValue({ id: 'p1' }) };
    const config = { getResolvedCredentials: async () => orgCreds('sk_test_org') };
    const svc = make({ prisma: refundPrisma, payments, config, paystack: new PaystackService() });
    const body = JSON.stringify({ event: 'refund.processed', data: { id: 1, transaction_reference: 'hoa_x', amount: 500, currency: 'NGN' } });

    await expect(svc.handleWebhook(body, sign(body, 'wrong_key'), JSON.parse(body))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(payments.refundByReference).not.toHaveBeenCalled();

    await svc.handleWebhook(body, sign(body, 'sk_test_org'), JSON.parse(body));
    expect(payments.refundByReference).toHaveBeenCalledTimes(1);
  });
});
