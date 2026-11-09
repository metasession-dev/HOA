import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser, Roles, Public } from '../common/decorators';
import { successResponse } from '../common/dto';
import { PaystackService } from '../payments/paystack.service';
import { PlatformBillingService } from './platform-billing.service';
import { CancelSubscriptionDto, ChangePlanDto, SubscribeDto } from './dto/platform-billing.dto';

@ApiTags('Platform Billing')
@ApiBearerAuth()
@Controller('platform-billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlatformBillingController {
  constructor(private readonly service: PlatformBillingService, private readonly paystack: PaystackService) {}

  /** Public pricing page — anyone can list active plans. */
  @Public()
  @Get('plans')
  async plans() {
    return successResponse(await this.service.listPlans());
  }

  /** Org's current subscription (or null). */
  @Get('subscription')
  async current(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.service.getForOrg(orgId));
  }

  /** Recent invoice/billing history. */
  @Get('invoices')
  async invoices(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.service.listInvoices(orgId));
  }

  /** Start the Paystack hosted checkout for a recurring subscription. */
  @Post('subscribe')
  @Roles('hoa_admin')
  async subscribe(@Body() dto: SubscribeDto, @CurrentUser('organizationId') orgId: string) {
    const result = await this.service.subscribe({
      organizationId: orgId,
      planCode: dto.planCode,
      email: dto.email,
      callbackUrl: dto.callbackUrl,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    });
    return successResponse(result);
  }

  /** Upgrade or downgrade the plan. New rate kicks in next cycle. */
  @Put('plan')
  @Roles('hoa_admin')
  async changePlan(
    @Body() dto: ChangePlanDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') actorId: string,
  ) {
    return successResponse(await this.service.changePlan({ organizationId: orgId, planCode: dto.planCode, actorId }));
  }

  @Post('cancel')
  @Roles('hoa_admin')
  async cancel(
    @Body() dto: CancelSubscriptionDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') actorId: string,
  ) {
    return successResponse(await this.service.cancel({ organizationId: orgId, reason: dto.reason, actorId }));
  }
}
