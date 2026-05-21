import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Phase 1.3 Paystack adapter.
 *
 * Pure adapter — no Prisma access, no business logic. Returns parsed response
 * payloads to the orchestrating PaymentIntentsService which decides what to do
 * with them (DB writes, audit logs, webhooks, etc.).
 *
 * In dev/test without `PAYSTACK_SECRET_KEY`, `isConfigured()` returns false and
 * higher-level callers can fall back to a mock flow that mimics Paystack's
 * happy path. This keeps the UI testable end-to-end without a real key.
 */

export type InitTransactionInput = {
  email: string;
  amountMinor: number; // Paystack expects amount in kobo / cents — minor units
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, any>;
};

export type InitTransactionResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

export type VerifyTransactionResult = {
  status: 'success' | 'failed' | 'abandoned' | 'reversed' | 'pending';
  reference: string;
  amountMinor: number;
  currency: string;
  paidAt?: string;
  channel?: string;
  customer?: { email?: string };
  rawPayload: any;
};

const PAYSTACK_BASE = 'https://api.paystack.co';
const FETCH_TIMEOUT_MS = 15_000;

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);

  isConfigured(): boolean {
    return !!process.env.PAYSTACK_SECRET_KEY;
  }

  /**
   * Hit Paystack's `/transaction/initialize` to get a hosted-checkout link.
   * Throws BadRequestException on Paystack-side rejection so the controller
   * can surface the error message to the admin/resident.
   */
  async initializeTransaction(input: InitTransactionInput): Promise<InitTransactionResult> {
    const key = this.requireKey();
    const body = {
      email: input.email,
      amount: input.amountMinor,
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    };
    const data = await this.post<any>('/transaction/initialize', body, key);
    if (!data?.status || !data?.data?.authorization_url) {
      throw new BadRequestException(`Paystack init failed: ${data?.message || 'unknown'}`);
    }
    return {
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
    };
  }

  /**
   * Verify a transaction by reference. Used as a belt-and-braces check on top
   * of the webhook — if the webhook is delayed or never fires, the callback
   * page can poll this and progress the payment.
   */
  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    const key = this.requireKey();
    const data = await this.get<any>(`/transaction/verify/${encodeURIComponent(reference)}`, key);
    const d = data?.data;
    if (!d) throw new BadRequestException(`Paystack verify failed: ${data?.message || 'unknown'}`);
    return {
      status: this.mapStatus(d.status),
      reference: d.reference,
      amountMinor: d.amount,
      currency: d.currency,
      paidAt: d.paid_at,
      channel: d.channel,
      customer: d.customer ? { email: d.customer.email } : undefined,
      rawPayload: d,
    };
  }

  /**
   * Validate the HMAC-SHA512 signature Paystack sends as `X-Paystack-Signature`.
   * MUST be called against the raw (unparsed) request body, not the JSON-parsed
   * version — even a single whitespace difference invalidates the HMAC.
   */
  verifyWebhookSignature(rawBody: string, header: string | undefined): void {
    const key = this.requireKey();
    if (!header) throw new UnauthorizedException('Missing X-Paystack-Signature');
    const expected = crypto.createHmac('sha512', key).update(rawBody).digest('hex');
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(String(header).trim(), 'hex');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        throw new UnauthorizedException('Invalid Paystack signature');
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Malformed Paystack signature');
    }
  }

  // ============ Phase: platform subscription helpers ============
  //
  // The transaction-init flow above charges a resident once. The methods below
  // wrap Paystack's plans + customers + subscriptions APIs so HOA.africa can
  // bill *organizations* on a recurring schedule.

  /** Create a Paystack plan. Idempotent on `name`. Amount is in kobo/cents. */
  async createPlan(input: { name: string; amountMinor: number; currency: string; interval?: 'monthly' | 'annually' }): Promise<{ planCode: string; raw: any }> {
    const key = this.requireKey();
    const data = await this.post<any>('/plan', {
      name: input.name,
      amount: input.amountMinor,
      currency: input.currency,
      interval: input.interval || 'monthly',
    }, key);
    const code = data?.data?.plan_code;
    if (!code) throw new BadRequestException(`Paystack plan create failed: ${data?.message || 'unknown'}`);
    return { planCode: code, raw: data.data };
  }

  /** Look up a plan by its plan_code. Used to confirm seed state. */
  async getPlan(planCode: string): Promise<any | null> {
    const key = this.requireKey();
    try {
      const data = await this.get<any>(`/plan/${encodeURIComponent(planCode)}`, key);
      return data?.data ?? null;
    } catch {
      return null;
    }
  }

  /** Create (or upsert) a customer by email. */
  async upsertCustomer(input: { email: string; firstName?: string; lastName?: string; phone?: string; metadata?: Record<string, any> }): Promise<{ customerCode: string; raw: any }> {
    const key = this.requireKey();
    const data = await this.post<any>('/customer', {
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      metadata: input.metadata,
    }, key);
    const code = data?.data?.customer_code;
    if (!code) throw new BadRequestException(`Paystack customer upsert failed: ${data?.message || 'unknown'}`);
    return { customerCode: code, raw: data.data };
  }

  /**
   * Initialise a transaction whose successful charge will create a Paystack
   * subscription via `plan`. This is the standard way to set up a recurring
   * subscription with hosted checkout — the first authorisation becomes the
   * billing card for subsequent renewals.
   */
  async initializeSubscriptionTransaction(input: {
    email: string;
    amountMinor: number;
    currency: string;
    planCode: string;
    reference: string;
    callbackUrl: string;
    metadata?: Record<string, any>;
  }): Promise<InitTransactionResult> {
    const key = this.requireKey();
    const data = await this.post<any>('/transaction/initialize', {
      email: input.email,
      amount: input.amountMinor,
      currency: input.currency,
      plan: input.planCode,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }, key);
    if (!data?.status || !data?.data?.authorization_url) {
      throw new BadRequestException(`Paystack subscription init failed: ${data?.message || 'unknown'}`);
    }
    return {
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
    };
  }

  /** Cancel a subscription on Paystack's side. Caller must supply the email
   *  token Paystack returns on subscription.create — without it the API
   *  refuses to disable. */
  async disableSubscription(input: { subscriptionCode: string; emailToken: string }): Promise<void> {
    const key = this.requireKey();
    await this.post<any>('/subscription/disable', {
      code: input.subscriptionCode,
      token: input.emailToken,
    }, key);
  }

  /** Re-enable a paused subscription (after card replacement, etc.). */
  async enableSubscription(input: { subscriptionCode: string; emailToken: string }): Promise<void> {
    const key = this.requireKey();
    await this.post<any>('/subscription/enable', {
      code: input.subscriptionCode,
      token: input.emailToken,
    }, key);
  }

  // ============ Internals ============

  private requireKey(): string {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) throw new BadRequestException('Paystack is not configured on this server');
    return key;
  }

  private mapStatus(s: string): VerifyTransactionResult['status'] {
    switch (s) {
      case 'success': return 'success';
      case 'failed': return 'failed';
      case 'abandoned': return 'abandoned';
      case 'reversed': return 'reversed';
      default: return 'pending';
    }
  }

  private async post<T>(path: string, body: any, key: string): Promise<T> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${PAYSTACK_BASE}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new BadRequestException(`Paystack ${path} ${res.status}: ${json?.message || 'unknown'}`);
      return json as T;
    } finally {
      clearTimeout(t);
    }
  }

  private async get<T>(path: string, key: string): Promise<T> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${PAYSTACK_BASE}${path}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: ctrl.signal,
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new BadRequestException(`Paystack ${path} ${res.status}: ${json?.message || 'unknown'}`);
      return json as T;
    } finally {
      clearTimeout(t);
    }
  }
}
