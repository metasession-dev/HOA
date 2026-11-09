import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { PaystackWebhookRouter } from '../../src/payments/paystack-webhook.router';
import { PaystackService } from '../../src/payments/paystack.service';
import { withEnv } from '../helpers/env';

const PLATFORM_KEY = 'sk_test_platform';
const sign = (body: string, key: string) => crypto.createHmac('sha512', key).update(body).digest('hex');

function setup() {
  const prisma: any = {
    paymentIntent: {
      findUnique: async ({ where }: any) => (where.providerReference.startsWith('hoa_') ? { id: 'pi' } : null),
    },
  };
  const intents = { handleWebhook: jest.fn().mockResolvedValue({ ok: true }) };
  const platform = { handleWebhook: jest.fn().mockResolvedValue({}) };
  const router = new PaystackWebhookRouter(prisma, new PaystackService(), intents as any, platform as any);
  jest.spyOn((router as any).logger, 'warn').mockImplementation(() => undefined);
  return { router, intents, platform };
}

const event = (o: any) => {
  const raw = JSON.stringify(o);
  return { raw, payload: JSON.parse(raw) };
};

describe('PaystackWebhookRouter', () => {
  it('sends resident charges to the resident flow (which verifies with the org key)', async () => {
    const { router, intents, platform } = setup();
    const { raw, payload } = event({ event: 'charge.success', data: { reference: 'hoa_1' } });

    await withEnv({ PAYSTACK_SECRET_KEY: PLATFORM_KEY }, () => router.route(raw, 'sig', payload));

    expect(intents.handleWebhook).toHaveBeenCalledWith(raw, 'sig', payload);
    expect(platform.handleWebhook).not.toHaveBeenCalled();
  });

  it('matches resident refunds by transaction_reference', async () => {
    const { router, intents } = setup();
    const { raw, payload } = event({ event: 'refund.processed', data: { transaction_reference: 'hoa_1' } });

    await withEnv({ PAYSTACK_SECRET_KEY: PLATFORM_KEY }, () => router.route(raw, 'sig', payload));

    expect(intents.handleWebhook).toHaveBeenCalled();
  });

  it('sends unmatched events to platform billing when signed with the platform key', async () => {
    const { router, intents, platform } = setup();
    const { raw, payload } = event({ event: 'subscription.create', data: { subscription_code: 'SUB_1' } });

    await withEnv({ PAYSTACK_SECRET_KEY: PLATFORM_KEY }, () => router.route(raw, sign(raw, PLATFORM_KEY), payload));

    expect(platform.handleWebhook).toHaveBeenCalledWith(payload);
    expect(intents.handleWebhook).not.toHaveBeenCalled();
  });

  it('rejects platform events with a bad signature', async () => {
    const { router, platform } = setup();
    const { raw, payload } = event({ event: 'charge.success', data: { reference: 'plat_o1_x' } });

    await withEnv({ PAYSTACK_SECRET_KEY: PLATFORM_KEY }, () =>
      expect(router.route(raw, sign(raw, 'wrong'), payload)).rejects.toBeInstanceOf(UnauthorizedException),
    );
    expect(platform.handleWebhook).not.toHaveBeenCalled();
  });

  it('ignores PAYSTACK_WEBHOOK_LENIENT in production', async () => {
    const { router, platform } = setup();
    const { raw, payload } = event({ event: 'subscription.create', data: {} });

    await withEnv({ PAYSTACK_SECRET_KEY: PLATFORM_KEY, PAYSTACK_WEBHOOK_LENIENT: '1', NODE_ENV: 'production' }, () =>
      expect(router.route(raw, sign(raw, 'wrong'), payload)).rejects.toBeInstanceOf(UnauthorizedException),
    );
    expect(platform.handleWebhook).not.toHaveBeenCalled();
  });

  it('honours PAYSTACK_WEBHOOK_LENIENT outside production', async () => {
    const { router, platform } = setup();
    const { raw, payload } = event({ event: 'subscription.create', data: {} });

    await withEnv({ PAYSTACK_SECRET_KEY: PLATFORM_KEY, PAYSTACK_WEBHOOK_LENIENT: '1', NODE_ENV: 'development' }, () =>
      router.route(raw, sign(raw, 'wrong'), payload),
    );
    expect(platform.handleWebhook).toHaveBeenCalled();
  });

  it('ignores unmatched events when no platform key is configured', async () => {
    const { router, platform } = setup();
    const { raw, payload } = event({ event: 'subscription.create', data: {} });

    const result: any = await withEnv({ PAYSTACK_SECRET_KEY: undefined }, () => router.route(raw, undefined, payload));

    expect(result).toMatchObject({ ok: true, ignored: true });
    expect(platform.handleWebhook).not.toHaveBeenCalled();
  });
});
