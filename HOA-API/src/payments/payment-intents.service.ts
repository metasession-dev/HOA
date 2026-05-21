import {
  Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, Logger,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { Actor, isResidentRole, actorOccupiesUnit, scopeInvoiceWhere } from '../common/scope.util';
import { PaystackService } from './paystack.service';
import { PaymentsService } from './payments.service';

/**
 * Phase 1.3 PaymentIntents orchestration.
 *
 * The resident clicks "Pay now" on an invoice → API requests an intent →
 * Paystack hosted checkout URL is returned → resident pays → Paystack hits
 * our webhook → we mark the intent `success`, log a Payment row via the
 * existing PaymentsService.logPayment() path (which triggers all the
 * downstream side-effects: invoice status flip, payment-plan progression,
 * audit log, webhook fanout).
 *
 * Idempotency boundaries:
 *   - One PaymentIntent per (providerReference) at the DB level.
 *   - Webhook handler is no-op if the intent is already `success`.
 *   - Resident retry on a still-pending invoice creates a *new* intent;
 *     stale ones get marked `expired` lazily.
 */
@Injectable()
export class PaymentIntentsService {
  private readonly logger = new Logger(PaymentIntentsService.name);

  constructor(
    private prisma: PrismaService,
    private paystack: PaystackService,
    private payments: PaymentsService,
  ) {}

  /**
   * Initialise a checkout intent for `invoiceId`. Resident-scoped: a resident
   * may only pay invoices on units they occupy.
   */
  async createIntent(orgId: string, actor: Actor, invoiceId: string, opts: { callbackUrl?: string } = {}) {
    const where = scopeInvoiceWhere({ id: invoiceId, organizationId: orgId }, actor);
    const invoice = await this.prisma.invoice.findFirst({
      where,
      include: {
        unit: { include: { occupancies: { where: { isActive: true }, include: { person: true } } } },
        payments: { where: { status: 'completed' } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (['paid', 'voided', 'on_plan'].includes(invoice.status)) {
      throw new ConflictException(`Cannot start a checkout for a ${invoice.status} invoice`);
    }

    // Compute outstanding to bill — don't charge already-paid portions.
    const paid = invoice.payments.reduce((s, p) => s.plus(new Decimal(p.amount.toString())), new Decimal(0));
    const outstanding = new Decimal(invoice.amount.toString()).minus(paid);
    if (outstanding.lessThanOrEqualTo(0)) {
      throw new ConflictException('Invoice has no outstanding balance');
    }

    // Pull the actor's email — Paystack requires it. For admin-initiated
    // intents we use the actor's email; for residents the same (since they're
    // logged in).
    const actorUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { email: true },
    });

    const reference = `hoa_${crypto.randomBytes(12).toString('hex')}`;
    const provider = this.paystack.isConfigured() ? 'paystack' : 'mock';

    // Compute amount in minor units (Paystack expects kobo / cents).
    const amountMinor = outstanding.times(100).toDecimalPlaces(0).toNumber();

    // Build callback URL with the reference embedded so the success page can
    // poll verify; we still rely on the webhook as the authoritative signal.
    const callbackBase = opts.callbackUrl || process.env.PAYSTACK_CALLBACK_URL || 'http://localhost:3002/invoices';
    const callbackUrl = `${callbackBase}?reference=${encodeURIComponent(reference)}&invoiceId=${invoice.id}`;

    let authorizationUrl: string;

    if (provider === 'paystack') {
      const r = await this.paystack.initializeTransaction({
        email: actorUser.email,
        amountMinor,
        currency: invoice.currency,
        reference,
        callbackUrl,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          organizationId: orgId,
          unitId: invoice.unitId,
        },
      });
      authorizationUrl = r.authorizationUrl;
    } else {
      // Mock provider: surface a URL that points to a "simulate success" page
      // so dev environments can exercise the full flow without a real key.
      const mockBase = process.env.MOCK_CHECKOUT_URL || 'http://localhost:3002/mock-checkout';
      authorizationUrl = `${mockBase}?reference=${encodeURIComponent(reference)}&amount=${amountMinor}&currency=${invoice.currency}&callback=${encodeURIComponent(callbackUrl)}`;
    }

    return this.prisma.$transaction(async (tx) => {
      const intent = await tx.paymentIntent.create({
        data: {
          organizationId: orgId,
          invoiceId: invoice.id,
          initiatedByUserId: actor.userId,
          provider,
          providerReference: reference,
          amount: outstanding,
          currency: invoice.currency,
          authorizationUrl,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'payment_intent_created',
          entityType: 'PaymentIntent',
          entityId: intent.id,
          changes: { invoiceId: invoice.id, provider, amount: outstanding.toString(), currency: invoice.currency } as any,
        },
      });
      return intent;
    });
  }

  /**
   * Inbound Paystack webhook handler. Verifies signature before this is called
   * (controller does that). Payload shape:
   *   { event: "charge.success", data: { reference, status, amount, ... } }
   */
  async handleWebhookEvent(payload: any) {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Empty webhook payload');
    }
    const event = String(payload.event || '');
    const data = payload.data;
    const reference = data?.reference;
    if (!reference) {
      this.logger.warn(`Webhook missing reference: ${event}`);
      return { ok: false, reason: 'no-reference' };
    }

    const intent = await this.prisma.paymentIntent.findUnique({
      where: { providerReference: reference },
      include: { invoice: true },
    });
    if (!intent) {
      // Unknown reference — might be a test event or for a different env.
      // Don't 404 so Paystack doesn't keep retrying.
      this.logger.warn(`Webhook reference ${reference} unknown — ignoring`);
      return { ok: true, ignored: true };
    }

    // Idempotency: a success event for an already-successful intent is a no-op.
    if (intent.status === 'success') return { ok: true, alreadyProcessed: true };

    if (event === 'charge.success' && data?.status === 'success') {
      return this.markSuccess(intent, data);
    }
    if (event === 'charge.failed' || data?.status === 'failed') {
      return this.markFailed(intent, data?.gateway_response || 'failed');
    }
    // Other events (refunds, disputes) — log + ignore for now.
    return { ok: true, ignored: true, event };
  }

  private async markSuccess(intent: any, data: any) {
    // Sanity: confirm the amount Paystack actually charged matches what we asked for.
    // Reject mismatches — these are either tampering or a misconfigured key.
    const expectedMinor = new Decimal(intent.amount.toString()).times(100).toDecimalPlaces(0).toNumber();
    if (data?.amount !== expectedMinor) {
      this.logger.error(`Amount mismatch on ${intent.providerReference}: expected ${expectedMinor} got ${data?.amount}`);
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'failed', failureReason: 'amount_mismatch', providerMetadata: this.scrub(data) as any },
      });
      return { ok: false, reason: 'amount-mismatch' };
    }

    await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: 'success',
        completedAt: new Date(),
        providerMetadata: this.scrub(data) as any,
      },
    });

    // Defer to the existing Payments path so we inherit all downstream
    // side-effects (invoice paid/partial, payment-plan completion, webhook
    // fanout to integrators, audit log).
    await this.payments.logPayment(
      {
        invoiceId: intent.invoiceId,
        amount: Number(intent.amount.toString()),
        method: intent.provider,
        processorReference: intent.providerReference,
      },
      intent.initiatedByUserId,
    );

    return { ok: true };
  }

  private async markFailed(intent: any, reason: string) {
    await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { status: 'failed', failureReason: reason?.slice(0, 500) },
    });
    return { ok: true, failed: true };
  }

  /**
   * Belt-and-braces: when the resident lands back on the callback page, we
   * verify against Paystack directly in case the webhook is delayed. This
   * never charges anything — it only nudges intent status forward.
   */
  async verifyIntent(orgId: string, actor: Actor, intentId: string) {
    const intent = await this.prisma.paymentIntent.findFirst({
      where: { id: intentId, organizationId: orgId },
      include: { invoice: true },
    });
    if (!intent) throw new NotFoundException('Intent not found');
    // Resident scoping: can only verify own intents OR intents against units they occupy.
    if (isResidentRole(actor.role)) {
      if (intent.initiatedByUserId !== actor.userId) {
        const occupies = await actorOccupiesUnit(this.prisma, actor, intent.invoice.unitId);
        if (!occupies) throw new ForbiddenException('Cannot verify this intent');
      }
    }
    if (intent.status === 'success') return intent;

    // Mock provider has no remote to verify against.
    if (intent.provider !== 'paystack') return intent;

    const result = await this.paystack.verifyTransaction(intent.providerReference);
    if (result.status === 'success') {
      const synthetic = {
        event: 'charge.success',
        data: { ...result.rawPayload, reference: intent.providerReference, status: 'success', amount: result.amountMinor },
      };
      await this.handleWebhookEvent(synthetic);
    } else if (result.status === 'failed' || result.status === 'abandoned' || result.status === 'reversed') {
      await this.markFailed(intent, `verify_${result.status}`);
    }
    return this.prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
  }

  async list(orgId: string, actor: Actor, query: { invoiceId?: string; status?: string } = {}) {
    let where: any = { organizationId: orgId };
    if (query.invoiceId) where.invoiceId = query.invoiceId;
    if (query.status) where.status = query.status;
    if (isResidentRole(actor.role)) {
      where = {
        ...where,
        OR: [
          { initiatedByUserId: actor.userId },
          {
            invoice: {
              unit: {
                occupancies: { some: { isActive: true, person: { userId: actor.userId } } },
              },
            },
          },
        ],
      };
    }
    return this.prisma.paymentIntent.findMany({
      where,
      include: { invoice: { select: { id: true, invoiceNumber: true, amount: true, currency: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Mock "complete" — only callable when provider is `mock`. Used by the
   * dev mock-checkout page to simulate Paystack hitting our webhook.
   */
  async mockComplete(orgId: string, actor: Actor, reference: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('mockComplete is dev-only');
    }
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { providerReference: reference },
    });
    if (!intent) throw new NotFoundException('Intent not found');
    if (intent.organizationId !== orgId) throw new ForbiddenException('Wrong org');
    if (intent.provider !== 'mock') throw new ConflictException('Intent is not a mock — use real Paystack flow');

    const expectedMinor = new Decimal(intent.amount.toString()).times(100).toDecimalPlaces(0).toNumber();
    const synthetic = {
      event: 'charge.success',
      data: {
        reference,
        status: 'success',
        amount: expectedMinor,
        currency: intent.currency,
        channel: 'mock',
        paid_at: new Date().toISOString(),
        gateway_response: 'Mock success',
      },
    };
    return this.handleWebhookEvent(synthetic);
  }

  /** Strip card numbers / sensitive fields from Paystack payload before persisting. */
  private scrub(data: any): any {
    if (!data || typeof data !== 'object') return data;
    const out: any = { ...data };
    // Paystack's `authorization` block contains card details — keep only the safe fields.
    if (out.authorization) {
      out.authorization = {
        bin: out.authorization.bin,
        last4: out.authorization.last4,
        brand: out.authorization.brand,
        bank: out.authorization.bank,
        country_code: out.authorization.country_code,
        channel: out.authorization.channel,
      };
    }
    // Customer block may have phone — leave as-is (no card PAN), but drop addresses for now.
    delete out.log;
    delete out.fees_breakdown;
    return out;
  }
}
