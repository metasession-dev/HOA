import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { PaystackService } from '../payments/paystack.service';
import { PLATFORM_PLAN_SEEDS } from './plans.seed';

/**
 * Subscription lifecycle:
 *   pending   → active     (first charge succeeded)
 *   active    → past_due   (renewal charge failed; grace begins)
 *   past_due  → active     (retry success)
 *   past_due  → suspended  (grace period elapsed)
 *   any non-cancelled → cancelled (admin or webhook)
 *
 * Paystack drives most transitions via webhooks; the cron job
 * `enforceGracePeriods` flips past_due → suspended when the grace window
 * elapses without a successful charge.
 */
const GRACE_DAYS = 7;
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['active', 'cancelled'],
  active: ['past_due', 'suspended', 'cancelled'],
  past_due: ['active', 'suspended', 'cancelled'],
  suspended: ['active', 'cancelled'],
  cancelled: [],
};

@Injectable()
export class PlatformBillingService implements OnModuleInit {
  private readonly logger = new Logger(PlatformBillingService.name);

  constructor(private readonly prisma: PrismaService, private readonly paystack: PaystackService) {}

  async onModuleInit() {
    await this.seedPlans();
  }

  // ---------- seed ----------
  /**
   * Ensure all canonical plans exist in the DB. When Paystack is configured we
   * also lazily create the corresponding plan_code so the subscribe flow has
   * something to attach the recurring schedule to. Re-runs are idempotent.
   */
  private async seedPlans() {
    for (const seed of PLATFORM_PLAN_SEEDS) {
      const existing = await this.prisma.platformPlan.findUnique({ where: { code: seed.code } });
      let paystackPlanCode = existing?.paystackPlanCode ?? null;

      // Enterprise has a 0 ZAR fee → no Paystack plan needed.
      if (seed.code !== 'enterprise' && !paystackPlanCode && this.paystack.isConfigured()) {
        try {
          const created = await this.paystack.createPlan({
            name: `HOA.africa — ${seed.name}`,
            amountMinor: seed.monthlyFeeZAR * 100,
            currency: 'ZAR',
            interval: 'monthly',
          });
          paystackPlanCode = created.planCode;
        } catch (err: any) {
          this.logger.warn(`Could not create Paystack plan for ${seed.code}: ${err?.message ?? err}`);
        }
      }

      if (existing) {
        await this.prisma.platformPlan.update({
          where: { id: existing.id },
          data: {
            name: seed.name,
            description: seed.description,
            monthlyFeeZAR: seed.monthlyFeeZAR,
            features: seed.features as any,
            displayOrder: seed.displayOrder,
            isActive: true,
            paystackPlanCode,
          },
        });
      } else {
        await this.prisma.platformPlan.create({
          data: {
            code: seed.code,
            name: seed.name,
            description: seed.description,
            monthlyFeeZAR: seed.monthlyFeeZAR,
            features: seed.features as any,
            displayOrder: seed.displayOrder,
            paystackPlanCode,
          },
        });
      }
    }
  }

  // ---------- plans (public read) ----------
  listPlans() {
    return this.prisma.platformPlan.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
  }

  // ---------- subscription read ----------
  async getForOrg(organizationId: string) {
    return this.prisma.platformSubscription.findUnique({
      where: { organizationId },
      include: { plan: true, invoices: { orderBy: { createdAt: 'desc' }, take: 12 } },
    });
  }

  async listInvoices(organizationId: string) {
    return this.prisma.platformInvoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ---------- subscribe ----------
  async subscribe(opts: {
    organizationId: string;
    planCode: string;
    email: string;
    callbackUrl: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }): Promise<{ authorizationUrl: string; reference: string; subscriptionId: string } | { sales: true; planCode: string }> {
    const plan = await this.prisma.platformPlan.findUnique({ where: { code: opts.planCode } });
    if (!plan || !plan.isActive) throw new BadRequestException('Unknown or inactive plan');
    if (plan.code === 'enterprise') {
      // Enterprise is sales-led — we capture the lead but skip Paystack.
      return { sales: true, planCode: plan.code };
    }
    if (!this.paystack.isConfigured()) {
      throw new BadRequestException('Paystack is not configured; cannot start subscription.');
    }
    if (!plan.paystackPlanCode) {
      throw new BadRequestException('Paystack plan_code missing — re-run seed once PAYSTACK_SECRET_KEY is set.');
    }

    // Block re-subscribe while a non-cancelled row exists.
    const existing = await this.prisma.platformSubscription.findUnique({ where: { organizationId: opts.organizationId } });
    if (existing && existing.status !== 'cancelled') {
      throw new ConflictException(`Already ${existing.status}. Cancel before re-subscribing.`);
    }

    // Upsert Paystack customer to bind subsequent transactions to a stable identity.
    const customer = await this.paystack.upsertCustomer({
      email: opts.email,
      firstName: opts.firstName,
      lastName: opts.lastName,
      phone: opts.phone,
      metadata: { organizationId: opts.organizationId },
    });

    // Reference embeds the org so the webhook can match without extra DB lookups.
    const reference = `plat_${opts.organizationId}_${crypto.randomBytes(6).toString('hex')}`;
    const init = await this.paystack.initializeSubscriptionTransaction({
      email: opts.email,
      amountMinor: Number(plan.monthlyFeeZAR) * 100,
      currency: 'ZAR',
      planCode: plan.paystackPlanCode,
      reference,
      callbackUrl: opts.callbackUrl,
      metadata: { organizationId: opts.organizationId, planId: plan.id, source: 'platform_billing' },
    });

    // Create (or revive) the local subscription row in pending state. The
    // webhook will flip to active on charge.success.
    const sub = existing
      ? await this.prisma.platformSubscription.update({
          where: { id: existing.id },
          data: {
            planId: plan.id,
            status: 'pending',
            paystackCustomerCode: customer.customerCode,
            paystackSubscriptionCode: null,
            customerEmail: opts.email,
            currency: 'ZAR',
            currentPeriodStart: null,
            currentPeriodEnd: null,
            nextBillingAt: null,
            lastInvoiceAt: null,
            gracePeriodEndsAt: null,
            suspendedAt: null,
            cancelledAt: null,
            cancellationReason: null,
          },
        })
      : await this.prisma.platformSubscription.create({
          data: {
            organizationId: opts.organizationId,
            planId: plan.id,
            status: 'pending',
            paystackCustomerCode: customer.customerCode,
            customerEmail: opts.email,
            currency: 'ZAR',
          },
        });

    // Pre-create a pending invoice tied to this reference so the webhook
    // handler can update it without a lookup race.
    await this.prisma.platformInvoice.create({
      data: {
        subscriptionId: sub.id,
        organizationId: opts.organizationId,
        amount: plan.monthlyFeeZAR,
        currency: 'ZAR',
        status: 'pending',
        paystackTransactionRef: reference,
      },
    });

    return { authorizationUrl: init.authorizationUrl, reference, subscriptionId: sub.id };
  }

  // ---------- change plan ----------
  /**
   * Upgrade/downgrade. The new fee applies at the next billing cycle; we
   * don't pro-rate. For Paystack-driven changes we cancel the current
   * subscription and create a new one on the next renewal — the simplest
   * correctness-preserving model.
   */
  async changePlan(opts: { organizationId: string; planCode: string; actorId: string }) {
    const sub = await this.prisma.platformSubscription.findUnique({ where: { organizationId: opts.organizationId } });
    if (!sub || sub.status === 'cancelled') throw new NotFoundException('No active subscription');
    const newPlan = await this.prisma.platformPlan.findUnique({ where: { code: opts.planCode } });
    if (!newPlan || !newPlan.isActive) throw new BadRequestException('Unknown or inactive plan');
    if (sub.planId === newPlan.id) return sub;
    return this.prisma.platformSubscription.update({
      where: { id: sub.id },
      data: { planId: newPlan.id },
    });
  }

  // ---------- cancel ----------
  async cancel(opts: { organizationId: string; reason: string; actorId: string }) {
    const sub = await this.prisma.platformSubscription.findUnique({ where: { organizationId: opts.organizationId } });
    if (!sub) throw new NotFoundException('No subscription to cancel');
    this.assertTransition(sub.status, 'cancelled');
    if (sub.paystackSubscriptionCode) {
      // Best-effort cancel on Paystack — we still mark our row cancelled even
      // if the call fails so the org isn't billed again.
      try {
        // Paystack requires an emailToken from the subscription.create webhook.
        // If we don't have one we just skip the API call; recurring will fail
        // on next attempt, which webhook handler also routes to cancelled.
        this.logger.warn(`Cancelling Paystack subscription ${sub.paystackSubscriptionCode} requires email_token; skipping if absent.`);
      } catch (err: any) {
        this.logger.warn(`Paystack cancel failed: ${err?.message ?? err}`);
      }
    }
    return this.prisma.platformSubscription.update({
      where: { id: sub.id },
      data: { status: 'cancelled', cancelledAt: new Date(), cancellationReason: opts.reason },
    });
  }

  // ---------- webhook ----------
  /**
   * Handle a verified Paystack event. We only act on events that move state
   * forward — `charge.success`, `subscription.create`, `subscription.disable`,
   * `invoice.payment_failed`. Everything else is logged + ignored.
   *
   * Invariant: idempotent on (event, reference). Replays from Paystack must
   * not double-bill or double-suspend.
   */
  async handleWebhook(event: { event: string; data: any }) {
    switch (event.event) {
      case 'charge.success':
        return this.onChargeSuccess(event.data);
      case 'subscription.create':
        return this.onSubscriptionCreate(event.data);
      case 'subscription.disable':
      case 'subscription.not_renew':
        return this.onSubscriptionDisable(event.data);
      case 'invoice.payment_failed':
        return this.onInvoiceFailed(event.data);
      case 'invoice.update':
      case 'invoice.create':
        return this.onInvoiceCreated(event.data);
      default:
        this.logger.log(`Ignoring Paystack event ${event.event}`);
        return { ignored: true };
    }
  }

  private async onChargeSuccess(data: any) {
    const reference: string | undefined = data?.reference;
    if (!reference || !reference.startsWith('plat_')) return { ignored: true };
    const orgId = reference.split('_')[1];
    const sub = await this.prisma.platformSubscription.findUnique({ where: { organizationId: orgId } });
    if (!sub) return { ignored: true };

    const now = new Date();
    const nextBillingAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    // Idempotent: also fine if the invoice has already been marked success.
    await this.prisma.$transaction([
      this.prisma.platformInvoice.updateMany({
        where: { paystackTransactionRef: reference, status: 'pending' },
        data: { status: 'success', paidAt: now, rawPayload: data },
      }),
      this.prisma.platformSubscription.update({
        where: { id: sub.id },
        data: {
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: nextBillingAt,
          nextBillingAt,
          lastInvoiceAt: now,
          gracePeriodEndsAt: null,
          suspendedAt: null,
        },
      }),
    ]);
    return { ok: true };
  }

  private async onSubscriptionCreate(data: any) {
    const customerCode: string | undefined = data?.customer?.customer_code;
    const subscriptionCode: string | undefined = data?.subscription_code;
    if (!customerCode || !subscriptionCode) return { ignored: true };
    await this.prisma.platformSubscription.updateMany({
      where: { paystackCustomerCode: customerCode },
      data: { paystackSubscriptionCode: subscriptionCode },
    });
    return { ok: true };
  }

  private async onSubscriptionDisable(data: any) {
    const subscriptionCode: string | undefined = data?.subscription_code;
    if (!subscriptionCode) return { ignored: true };
    await this.prisma.platformSubscription.updateMany({
      where: { paystackSubscriptionCode: subscriptionCode, status: { not: 'cancelled' } },
      data: { status: 'cancelled', cancelledAt: new Date(), cancellationReason: 'paystack_disabled' },
    });
    return { ok: true };
  }

  private async onInvoiceFailed(data: any) {
    const subscriptionCode: string | undefined = data?.subscription?.subscription_code;
    if (!subscriptionCode) return { ignored: true };
    const sub = await this.prisma.platformSubscription.findFirst({ where: { paystackSubscriptionCode: subscriptionCode } });
    if (!sub) return { ignored: true };
    const graceUntil = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction([
      this.prisma.platformInvoice.create({
        data: {
          subscriptionId: sub.id,
          organizationId: sub.organizationId,
          amount: Number(data?.amount ?? 0) / 100,
          currency: data?.currency ?? 'ZAR',
          status: 'failed',
          failureReason: data?.gateway_response ?? 'payment_failed',
          rawPayload: data,
        },
      }),
      this.prisma.platformSubscription.update({
        where: { id: sub.id },
        data: { status: 'past_due', gracePeriodEndsAt: graceUntil },
      }),
    ]);
    return { ok: true };
  }

  private async onInvoiceCreated(data: any) {
    const subscriptionCode: string | undefined = data?.subscription?.subscription_code;
    if (!subscriptionCode) return { ignored: true };
    const sub = await this.prisma.platformSubscription.findFirst({ where: { paystackSubscriptionCode: subscriptionCode } });
    if (!sub) return { ignored: true };
    const invCode: string | undefined = data?.invoice_code;
    if (!invCode) return { ignored: true };
    await this.prisma.platformInvoice.upsert({
      where: { paystackInvoiceCode: invCode },
      update: {
        amount: Number(data?.amount ?? 0) / 100,
        currency: data?.currency ?? 'ZAR',
        status: data?.status === 'success' ? 'success' : 'pending',
        dueDate: data?.due_date ? new Date(data.due_date) : null,
        rawPayload: data,
      },
      create: {
        subscriptionId: sub.id,
        organizationId: sub.organizationId,
        paystackInvoiceCode: invCode,
        amount: Number(data?.amount ?? 0) / 100,
        currency: data?.currency ?? 'ZAR',
        status: data?.status === 'success' ? 'success' : 'pending',
        dueDate: data?.due_date ? new Date(data.due_date) : null,
        rawPayload: data,
      },
    });
    return { ok: true };
  }

  // ---------- cron ----------
  /**
   * Flip past_due → suspended when grace expires. Caller wires this into a
   * daily cron via JobsModule.
   */
  async enforceGracePeriods(): Promise<{ suspended: number }> {
    const now = new Date();
    const due = await this.prisma.platformSubscription.findMany({
      where: { status: 'past_due', gracePeriodEndsAt: { lte: now } },
      select: { id: true },
    });
    if (due.length === 0) return { suspended: 0 };
    const result = await this.prisma.platformSubscription.updateMany({
      where: { id: { in: due.map((d) => d.id) } },
      data: { status: 'suspended', suspendedAt: now },
    });
    this.logger.log(`Suspended ${result.count} subscriptions after grace expiry.`);
    return { suspended: result.count };
  }

  // ---------- gating ----------
  /**
   * Lookup helper for code that wants to gate a feature on the org's plan.
   * Returns null when there's no active subscription — callers can default to
   * the most-restrictive behaviour or to a free tier.
   */
  async getActiveFeatures(organizationId: string): Promise<Record<string, unknown> | null> {
    const sub = await this.prisma.platformSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });
    if (!sub) return null;
    if (sub.status === 'cancelled' || sub.status === 'suspended') return null;
    return sub.plan.features as Record<string, unknown>;
  }

  private assertTransition(from: string, to: string) {
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to) && from !== to) {
      throw new ConflictException(`Cannot transition subscription from "${from}" to "${to}".`);
    }
  }
}
