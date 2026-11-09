import { BadRequestException, Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/decorators';
import { PaystackWebhookRouter } from './paystack-webhook.router';

/**
 * Platform-billing Paystack webhook URL (kept for accounts already pointed
 * here). It is an alias of `/payments/webhook/paystack`: both go through
 * PaystackWebhookRouter, so a Paystack account can use EITHER URL and still
 * deliver resident payments, refunds and subscription events.
 *
 * Lives in PaymentsModule (not PlatformBillingModule) so it can reach the
 * resident payment flow without a circular module import.
 */
@ApiTags('Platform Billing')
@Controller('platform-billing/webhook')
export class PlatformBillingWebhookController {
  constructor(private readonly router: PaystackWebhookRouter) {}

  @Public()
  @Throttle({ short: { limit: 30, ttl: 1000 }, medium: { limit: 600, ttl: 60_000 } })
  @Post()
  @HttpCode(200)
  async receive(@Req() req: Request, @Headers('x-paystack-signature') signature: string | undefined, @Body() body: any) {
    const raw = (req as any).rawBody;
    if (!raw) throw new BadRequestException('Raw body unavailable; webhook cannot be verified');
    await this.router.route(raw.toString('utf8'), signature, body);
    return { ok: true };
  }
}
