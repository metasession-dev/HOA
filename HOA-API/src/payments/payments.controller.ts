import {
  Controller, Get, Post, Body, Query, Param, Req, Headers, BadRequestException, UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { PaymentIntentsService } from './payment-intents.service';
import { PaystackService } from './paystack.service';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { PaginationDto, successResponse } from '../common/dto';
import { Idempotent, IdempotencyInterceptor } from '../common/idempotency';

const PAYMENT_METHODS = ['cash', 'eft', 'card', 'mobile_money', 'cheque', 'other'] as const;

class LogPaymentDto {
  @IsString() invoiceId: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsIn(PAYMENT_METHODS) method: (typeof PAYMENT_METHODS)[number];
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
@UseInterceptors(IdempotencyInterceptor)
export class PaymentsController {
  constructor(
    private service: PaymentsService,
    private intents: PaymentIntentsService,
    private paystack: PaystackService,
  ) {}

  @Get()
  async findAll(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Query() query: PaginationDto,
  ) {
    return this.service.findAll(orgId, query, { userId, role });
  }

  @Roles('finance_officer', 'hoa_admin', 'super_admin')
  @Post()
  async logPayment(@Body() data: LogPaymentDto, @CurrentUser('sub') userId: string) {
    const payment = await this.service.logPayment(data, userId);
    return successResponse(payment);
  }

  // Reverse a payment (refund / chargeback / mistaken entry). Removes its
  // allocations and restores the affected invoices' balances.
  @Roles('finance_officer', 'hoa_admin', 'super_admin')
  @Post(':id/reverse')
  async reverse(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return successResponse(await this.service.reversePayment(orgId, userId, id, body?.reason));
  }

  // Manually re-run the idempotent ledger backfill (also runs at boot).
  @Roles('super_admin')
  @Post('admin/backfill-ledger')
  async backfillLedger() {
    return successResponse(await this.service.backfillLedger());
  }

  // ============ Payment intents (Phase 1.3) ============

  /**
   * Resident-initiated checkout. Returns the hosted-checkout `authorizationUrl`
   * the client redirects to. The body shape is intentionally tiny — the server
   * derives amount + email + reference itself.
   */
  @Post('intents')
  @Idempotent()
  async createIntent(
    @Body() body: { invoiceId: string; callbackUrl?: string },
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    if (!body?.invoiceId) throw new BadRequestException('invoiceId is required');
    return successResponse(
      await this.intents.createIntent(orgId, { userId, role }, body.invoiceId, { callbackUrl: body.callbackUrl }),
    );
  }

  @Get('intents')
  async listIntents(
    @Query('invoiceId') invoiceId: string | undefined,
    @Query('status') status: string | undefined,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.intents.list(orgId, { userId, role }, { invoiceId, status }));
  }

  @Post('intents/:id/verify')
  async verifyIntent(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.intents.verifyIntent(orgId, { userId, role }, id));
  }

  /**
   * Dev-only mock completion. Wraps a synthetic Paystack webhook event so the
   * UI can simulate the full payment flow without a real key.
   */
  @Post('intents/mock-complete')
  async mockComplete(
    @Body() body: { reference: string },
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    if (!body?.reference) throw new BadRequestException('reference is required');
    return successResponse(await this.intents.mockComplete(orgId, { userId, role }, body.reference));
  }

  // ============ Paystack webhook ============

  /**
   * Inbound Paystack events. Public — auth is the HMAC signature on the raw
   * body. We pull the raw bytes via `req.rawBody` (set by main.ts) so a single
   * byte of JSON-parse normalization doesn't invalidate the HMAC.
   *
   * Throttle is generous because Paystack retries on non-2xx; we want a flat
   * spike, not a per-IP block.
   */
  @Public()
  @Throttle({ short: { limit: 30, ttl: 1000 }, medium: { limit: 600, ttl: 60_000 } })
  @Post('webhook/paystack')
  async paystackWebhook(
    @Req() req: Request,
    @Headers('x-paystack-signature') signature: string | undefined,
    @Body() body: any,
  ) {
    const raw = (req as any).rawBody;
    if (!raw) throw new BadRequestException('Raw body unavailable; webhook cannot be verified');
    // Signature is verified inside handleWebhook against the owning org's secret.
    const result = await this.intents.handleWebhook(raw.toString('utf8'), signature, body);
    return successResponse(result);
  }

  // Legacy mock retained for older integrations
  @Public()
  @Post('webhook')
  async legacyWebhook(@Body() body: any) {
    const result = await this.service.webhookMock(body);
    return successResponse(result);
  }
}
