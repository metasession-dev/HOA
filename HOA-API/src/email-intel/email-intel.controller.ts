import {
  Controller, Get, Post, Body, Param, Query, BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EmailIntelService, InboundPayload } from './email-intel.service';
import { CurrentUser, Roles, Public } from '../common/decorators';
import { successResponse } from '../common/dto';

@ApiTags('EmailIntel')
@Controller('email-intel')
export class EmailIntelController {
  constructor(private intel: EmailIntelService) {}

  /**
   * Public inbound webhook. Providers (Resend Inbound, SendGrid Parse,
   * Mailgun, an SMTP-to-HTTP relay) POST normalized payloads here. We
   * dedup by providerMessageId so retries don't double-route.
   *
   * Signature verification is provider-specific. In production this endpoint
   * is bound to a provider-specific path that does signature validation
   * (similar to /payments/webhook/paystack); the unauthenticated catch-all
   * exists only in dev when EMAIL_INBOUND_OPEN=1.
   */
  @Public()
  @Throttle({ short: { limit: 30, ttl: 1000 }, medium: { limit: 1000, ttl: 60_000 } })
  @Post('webhook/inbound')
  async inboundWebhook(@Body() body: InboundPayload) {
    if (process.env.NODE_ENV === 'production' && process.env.EMAIL_INBOUND_OPEN !== '1') {
      throw new BadRequestException('Inbound endpoint is not enabled in production');
    }
    return successResponse(await this.intel.ingest(body));
  }

  // ============ Admin queue ============

  @Get()
  @ApiBearerAuth()
  @Roles('hoa_admin', 'super_admin', 'communications_manager')
  async list(
    @Query('status') status: string | undefined,
    @Query('intent') intent: string | undefined,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.intel.list(orgId, { status, intent }));
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles('hoa_admin', 'super_admin', 'communications_manager')
  async findById(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.intel.findById(orgId, id));
  }

  @Post(':id/reclassify')
  @ApiBearerAuth()
  @Roles('hoa_admin', 'super_admin', 'communications_manager')
  async reclassify(@Param('id') id: string) {
    return successResponse(await this.intel.classify(id));
  }

  @Post(':id/approve-reply')
  @ApiBearerAuth()
  @Roles('hoa_admin', 'super_admin', 'communications_manager')
  async approveReply(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.intel.approveReply(orgId, { userId, role }, id));
  }

  @Post(':id/escalate')
  @ApiBearerAuth()
  @Roles('hoa_admin', 'super_admin', 'communications_manager')
  async escalate(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.intel.escalate(orgId, { userId, role }, id, body?.notes));
  }
}
