import {
  Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, Logger,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { Actor, isResidentRole, actorOccupiesUnit, scopeInvoiceWhere } from '../common/scope.util';
import { PaystackService } from './paystack.service';
import { PaymentsService } from './payments.service';
import { PaymentConfigService } from './payment-config.service';
import { UnitBillingService } from '../billing/unit-billing.service';

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
    private paymentConfig: PaymentConfigService,
    private unitBilling: UnitBillingService,
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

    // Resolve the owning org's Paystack credentials (its own encrypted key, or
    // the platform env key as a legacy fallback). With no credentials we mock in
    // dev; in production we refuse rather than silently faking a charge.
    const creds = await this.paymentConfig.getResolvedCredentials(orgId);
    let provider: 'paystack' | 'mock';
    if (creds) {
      provider = 'paystack';
    } else if (process.env.NODE_ENV !== 'production') {
      provider = 'mock';
    } else {
      throw new BadRequestException(
        'Online payments are not configured for this organisation. An administrator must add Paystack keys under Settings → Payment configuration.',
      );
    }

    // Compute amount in minor units (Paystack expects kobo / cents).
    const amountMinor = outstanding.times(100).toDecimalPlaces(0).toNumber();

    // Build callback URL with the reference embedded so the success page can
    // poll verify; we still rely on the webhook as the authoritative signal.
    const callbackBase = opts.callbackUrl || process.env.PAYSTACK_CALLBACK_URL || 'http://localhost:3002/invoices';
    const callbackUrl = `${callbackBase}?reference=${encodeURIComponent(reference)}&invoiceId=${invoice.id}`;

    let authorizationUrl: string;

    if (provider === 'paystack') {
      const r = await this.paystack.initializeTransaction(
        {
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
          subaccount: creds!.subaccountCode,
          bearer: creds!.subaccountCode ? creds!.feeBearer : null,
        },
        creds!.secretKey,
      );
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
   * Phase 5 (hardened): resident "pay any term" prepay.
   *
   * We quote the term (which validates eligibility + locks the exact periods and
   * amounts) and open a checkout carrying that plan — but DO NOT create any
   * invoices yet. The period invoices are materialized + paid atomically only on
   * payment success (see markSuccess → materializePrepayFromPlan). This way an
   * abandoned checkout never leaves stray unpaid invoices, and repeated attempts
   * can't pile up duplicate billing (the per-unit period unique stays the guard).
   */
  async prepay(orgId: string, actor: Actor, unitBillingId: string, request: { periods?: number; days?: number }, opts: { callbackUrl?: string } = {}) {
    const quote = await this.unitBilling.quotePrepay(actor.userId, unitBillingId, request);
    if (!quote || quote.count === 0) {
      throw new ConflictException('You are already covered for this term — there is nothing to prepay.');
    }
    const currency = quote.currency;
    const outstanding = new Decimal(quote.totalAmount.toString());
    if (outstanding.lessThanOrEqualTo(0)) throw new ConflictException('Nothing to pay');

    const actorUser = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { email: true } });
    const reference = `hoa_${crypto.randomBytes(12).toString('hex')}`;

    const creds = await this.paymentConfig.getResolvedCredentials(orgId);
    let provider: 'paystack' | 'mock';
    if (creds) provider = 'paystack';
    else if (process.env.NODE_ENV !== 'production') provider = 'mock';
    else throw new BadRequestException('Online payments are not configured for this organisation.');

    const amountMinor = outstanding.times(100).toDecimalPlaces(0).toNumber();
    const callbackBase = opts.callbackUrl || process.env.PAYSTACK_CALLBACK_URL || 'http://localhost:3002/invoices';
    const callbackUrl = `${callbackBase}?reference=${encodeURIComponent(reference)}&prepay=1`;

    let authorizationUrl: string;
    if (provider === 'paystack') {
      const r = await this.paystack.initializeTransaction(
        {
          email: actorUser.email,
          amountMinor,
          currency,
          reference,
          callbackUrl,
          metadata: { unitBillingId, organizationId: orgId, prepay: true },
          subaccount: creds!.subaccountCode,
          bearer: creds!.subaccountCode ? creds!.feeBearer : null,
        },
        creds!.secretKey,
      );
      authorizationUrl = r.authorizationUrl;
    } else {
      const mockBase = process.env.MOCK_CHECKOUT_URL || 'http://localhost:3002/mock-checkout';
      authorizationUrl = `${mockBase}?reference=${encodeURIComponent(reference)}&amount=${amountMinor}&currency=${currency}&callback=${encodeURIComponent(callbackUrl)}`;
    }

    // The plan rides on providerMetadata so no invoices exist until payment.
    const plan = {
      unitBillingId,
      termLabel: quote.termLabel,
      billingTypeName: quote.billingTypeName,
      currency,
      periods: quote.periods, // [{ periodKey, from, to, amount }]
    };

    return this.prisma.$transaction(async (tx) => {
      const intent = await tx.paymentIntent.create({
        data: {
          organizationId: orgId,
          invoiceId: null,
          invoiceIds: [],
          initiatedByUserId: actor.userId,
          provider,
          providerReference: reference,
          amount: outstanding,
          currency,
          authorizationUrl,
          providerMetadata: { prepay: plan } as any,
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
          changes: { prepay: true, unitBillingId, termLabel: quote.termLabel, amount: outstanding.toString(), currency } as any,
        },
      });
      return intent;
    });
  }

  /** Open a checkout that settles MANY invoices in one payment. */
  async createMultiInvoiceIntent(orgId: string, actor: Actor, invoiceIds: string[], opts: { callbackUrl?: string } = {}) {
    const invoices = await this.prisma.invoice.findMany({
      where: { id: { in: invoiceIds }, organizationId: orgId },
      select: { id: true, amount: true, amountPaid: true, currency: true, unitId: true, invoiceNumber: true },
    });
    if (invoices.length === 0) throw new NotFoundException('No invoices to pay');

    const currency = invoices[0].currency;
    let outstanding = new Decimal(0);
    for (const inv of invoices) {
      outstanding = outstanding.plus(Decimal.max(new Decimal(inv.amount.toString()).minus(new Decimal(inv.amountPaid.toString())), new Decimal(0)));
    }
    if (outstanding.lessThanOrEqualTo(0)) throw new ConflictException('Nothing to pay');

    const actorUser = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { email: true } });
    const reference = `hoa_${crypto.randomBytes(12).toString('hex')}`;

    const creds = await this.paymentConfig.getResolvedCredentials(orgId);
    let provider: 'paystack' | 'mock';
    if (creds) provider = 'paystack';
    else if (process.env.NODE_ENV !== 'production') provider = 'mock';
    else throw new BadRequestException('Online payments are not configured for this organisation.');

    const amountMinor = outstanding.times(100).toDecimalPlaces(0).toNumber();
    const callbackBase = opts.callbackUrl || process.env.PAYSTACK_CALLBACK_URL || 'http://localhost:3002/invoices';
    const callbackUrl = `${callbackBase}?reference=${encodeURIComponent(reference)}&prepay=1`;

    let authorizationUrl: string;
    if (provider === 'paystack') {
      const r = await this.paystack.initializeTransaction(
        {
          email: actorUser.email,
          amountMinor,
          currency,
          reference,
          callbackUrl,
          metadata: { invoiceIds, organizationId: orgId, unitId: invoices[0].unitId, prepay: true },
          subaccount: creds!.subaccountCode,
          bearer: creds!.subaccountCode ? creds!.feeBearer : null,
        },
        creds!.secretKey,
      );
      authorizationUrl = r.authorizationUrl;
    } else {
      const mockBase = process.env.MOCK_CHECKOUT_URL || 'http://localhost:3002/mock-checkout';
      authorizationUrl = `${mockBase}?reference=${encodeURIComponent(reference)}&amount=${amountMinor}&currency=${currency}&callback=${encodeURIComponent(callbackUrl)}`;
    }

    return this.prisma.$transaction(async (tx) => {
      const intent = await tx.paymentIntent.create({
        data: {
          organizationId: orgId,
          invoiceId: invoices[0].id,
          invoiceIds,
          initiatedByUserId: actor.userId,
          provider,
          providerReference: reference,
          amount: outstanding,
          currency,
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
          changes: { invoiceIds, provider, amount: outstanding.toString(), currency } as any,
        },
      });
      return intent;
    });
  }

  /**
   * Webhook entrypoint with multi-tenant signature verification. We can only
   * pick the right secret after we know which org the event belongs to, so:
   *   1. read the `reference` from the (still-untrusted) payload,
   *   2. locate the PaymentIntent → its organizationId,
   *   3. verify the HMAC over the RAW body using that org's secret,
   *   4. process the parsed payload.
   * The reference only selects which secret to check against — forging a valid
   * HMAC still requires that org's secret, so this is safe.
   */
  async handleWebhook(rawBody: string, signature: string | undefined, payload: any) {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Empty webhook payload');
    }
    const reference = payload?.data?.reference;
    if (!reference) {
      this.logger.warn('Webhook missing reference; ignoring');
      return { ok: true, ignored: true };
    }
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { providerReference: reference },
      select: { organizationId: true },
    });
    if (!intent) {
      // Unknown reference (test event / different env) — nothing to verify or do.
      this.logger.warn(`Webhook reference ${reference} unknown — ignoring`);
      return { ok: true, ignored: true };
    }
    const creds = await this.paymentConfig.getResolvedCredentials(intent.organizationId);
    if (!creds) {
      this.logger.error(`No Paystack secret to verify webhook for org ${intent.organizationId}`);
      return { ok: false, reason: 'no-secret' };
    }
    this.paystack.verifyWebhookSignature(rawBody, signature, creds.secretKey);
    return this.handleWebhookEvent(payload);
  }

  /**
   * Inbound Paystack webhook handler. Signature is verified by `handleWebhook`
   * (or, for the synthetic mock/verify paths, trust is established by the caller).
   * Payload shape: { event: "charge.success", data: { reference, status, amount, ... } }
   */
  async handleWebhookEvent(payload: any) {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Empty webhook payload');
    }
    const event = String(payload.event || '');
    const data = payload.data;

    // Refund events reference the ORIGINAL transaction, and arrive AFTER the
    // intent is already 'success' — so handle them before the success
    // short-circuit below. A processed refund reverses the matching payment.
    if (event.startsWith('refund')) {
      const txRef = data?.transaction?.reference || data?.transaction_reference || data?.reference;
      if (!txRef) return { ok: true, ignored: true, event };
      const refIntent = await this.prisma.paymentIntent.findUnique({
        where: { providerReference: txRef },
        select: { organizationId: true },
      });
      if (!refIntent) return { ok: true, ignored: true, event };
      if (event === 'refund.processed') {
        const reversed = await this.payments.reverseByReference(refIntent.organizationId, txRef, 'paystack_refund');
        return { ok: true, refunded: !!reversed };
      }
      return { ok: true, ignored: true, event };
    }

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

    // Reject a currency mismatch outright — never settle an invoice with money
    // charged in a different currency than the intent.
    if (data?.currency && String(data.currency).toUpperCase() !== String(intent.currency).toUpperCase()) {
      this.logger.error(`Currency mismatch on ${intent.providerReference}: expected ${intent.currency} got ${data.currency}`);
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'failed', failureReason: 'currency_mismatch', providerMetadata: this.scrub(data) as any },
      });
      return { ok: false, reason: 'currency-mismatch' };
    }

    // Preserve the prepay plan (if any) on providerMetadata alongside the
    // scrubbed processor payload.
    const prepay = (intent.providerMetadata as any)?.prepay;
    await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: 'success',
        completedAt: new Date(),
        providerMetadata: { ...(intent.providerMetadata as any), paystack: this.scrub(data) } as any,
      },
    });

    const amount = Number(intent.amount.toString());

    if (prepay) {
      // Prepay: materialize the planned period invoices NOW (idempotent via the
      // per-unit period unique), then allocate this payment across them. Both
      // steps are idempotent, so a webhook retry converges without duplicating.
      const invoiceIds = await this.unitBilling.materializePrepayFromPlan(intent.organizationId, prepay, intent.initiatedByUserId);
      if (invoiceIds.length > 0) {
        await this.payments.logAllocatedPayment(
          {
            organizationId: intent.organizationId,
            invoiceIds,
            amount,
            method: intent.provider,
            processorReference: intent.providerReference,
            currency: intent.currency,
          },
          intent.initiatedByUserId,
        );
      }
      return { ok: true };
    }

    // Non-prepay: settle the pre-existing invoice(s). Single stays on the
    // verified logPayment path; multi allocates the lump sum.
    const ids: string[] = (intent.invoiceIds && intent.invoiceIds.length > 0)
      ? intent.invoiceIds
      : (intent.invoiceId ? [intent.invoiceId] : []);
    const single = ids[0];
    if (ids.length > 1) {
      await this.payments.logAllocatedPayment(
        {
          organizationId: intent.organizationId,
          invoiceIds: ids,
          amount,
          method: intent.provider,
          processorReference: intent.providerReference,
          currency: intent.currency,
        },
        intent.initiatedByUserId,
      );
    } else if (single) {
      await this.payments.logPayment(
        {
          invoiceId: single,
          amount,
          method: intent.provider,
          processorReference: intent.providerReference,
        },
        intent.initiatedByUserId,
      );
    }

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
        const occupies = intent.invoice
          ? await actorOccupiesUnit(this.prisma, actor, intent.invoice.unitId)
          : false;
        if (!occupies) throw new ForbiddenException('Cannot verify this intent');
      }
    }
    if (intent.status === 'success') return intent;

    // Mock provider has no remote to verify against.
    if (intent.provider !== 'paystack') return intent;

    const creds = await this.paymentConfig.getResolvedCredentials(intent.organizationId);
    if (!creds) return intent; // can't verify without a key; webhook will reconcile
    const result = await this.paystack.verifyTransaction(intent.providerReference, creds.secretKey);
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
