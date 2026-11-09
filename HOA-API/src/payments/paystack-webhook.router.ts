import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PaystackService } from './paystack.service';
import { PaymentIntentsService } from './payment-intents.service';
import { PlatformBillingService } from '../platform-billing/platform-billing.service';

/**
 * Single entry point for every Paystack webhook, whichever URL it arrived on.
 *
 * Paystack allows ONE webhook URL per account (per test/live mode). The
 * platform's own account both bills HOAs (subscriptions) and can serve as the
 * legacy fallback for resident payments, so its events are a mix of both. Both
 * `/payments/webhook/paystack` and `/platform-billing/webhook` call `route()`,
 * which dispatches by reference:
 *
 *   - reference matches a resident PaymentIntent → resident flow, verified
 *     against the owning org's secret (org key, or env key fallback);
 *   - anything else (plat_… charges, subscription.* / invoice.* events) →
 *     platform billing, verified against the platform env key.
 */
@Injectable()
export class PaystackWebhookRouter {
  private readonly logger = new Logger(PaystackWebhookRouter.name);

  constructor(
    private prisma: PrismaService,
    private paystack: PaystackService,
    private intents: PaymentIntentsService,
    private platformBilling: PlatformBillingService,
  ) {}

  async route(rawBody: string, signature: string | undefined, payload: any) {
    const d = payload?.data;
    const reference: string | undefined = d?.reference || d?.transaction_reference || d?.transaction?.reference;

    if (reference) {
      const intent = await this.prisma.paymentIntent.findUnique({
        where: { providerReference: reference },
        select: { id: true },
      });
      if (intent) return this.intents.handleWebhook(rawBody, signature, payload);
    }

    // Platform billing event (or an unknown reference from another env).
    if (!process.env.PAYSTACK_SECRET_KEY) {
      this.logger.warn(`Paystack event ${payload?.event} not matched to a resident payment and no platform key is set — ignoring`);
      return { ok: true, ignored: true };
    }
    try {
      this.paystack.verifyWebhookSignature(rawBody, signature);
    } catch (err) {
      // Escape hatch for local debugging only — never honoured in production.
      const lenient = process.env.PAYSTACK_WEBHOOK_LENIENT === '1' && process.env.NODE_ENV !== 'production';
      if (!lenient) throw err;
    }
    const result = await this.platformBilling.handleWebhook(payload);
    return { ok: true, platform: true, result };
  }
}
