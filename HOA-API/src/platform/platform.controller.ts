import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiKeysService } from './api-keys.service';
import { WebhooksService, ALLOWED_EVENTS } from './webhooks.service';
import {
  CreateApiKeyDto, RevokeApiKeyDto, CreateWebhookEndpointDto, UpdateWebhookEndpointDto,
} from './dto/platform.dto';
import { CurrentUser, Roles, RequirePermissions } from '../common/decorators';
import { successResponse } from '../common/dto';

@ApiTags('Platform')
@ApiBearerAuth()
@Controller('platform')
@Roles('hoa_admin', 'super_admin')
export class PlatformController {
  constructor(private apiKeys: ApiKeysService, private webhooks: WebhooksService) {}

  /**
   * Identify the caller. Works with both JWT and X-API-Key. The most common
   * integration smoke test: "did my key auth correctly?". Overrides the
   * class-level @Roles so an API-key principal can hit this endpoint.
   */
  @Get('whoami')
  @Roles('hoa_admin', 'super_admin', 'api_key')
  @RequirePermissions('*')
  async whoami(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse({ userId, role, organizationId: orgId });
  }

  // ============== API KEYS ==============

  @Get('api-keys')
  async listKeys(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.apiKeys.list({ userId, role, organizationId: orgId }));
  }

  @Post('api-keys')
  async createKey(
    @Body() dto: CreateApiKeyDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.apiKeys.create({ userId, role, organizationId: orgId }, dto));
  }

  @Delete('api-keys/:id')
  async revokeKey(
    @Param('id') id: string,
    @Body() dto: RevokeApiKeyDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.apiKeys.revoke({ userId, role, organizationId: orgId }, id, dto?.reason));
  }

  // ============== WEBHOOKS ==============

  @Get('webhooks/events')
  async allowedEvents() {
    return successResponse({ events: ALLOWED_EVENTS });
  }

  @Get('webhooks')
  async listEndpoints(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.webhooks.listEndpoints({ userId, role, organizationId: orgId }));
  }

  @Post('webhooks')
  async createEndpoint(
    @Body() dto: CreateWebhookEndpointDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.webhooks.createEndpoint({ userId, role, organizationId: orgId }, dto));
  }

  @Put('webhooks/:id')
  async updateEndpoint(
    @Param('id') id: string,
    @Body() dto: UpdateWebhookEndpointDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.webhooks.updateEndpoint({ userId, role, organizationId: orgId }, id, dto));
  }

  @Post('webhooks/:id/rotate')
  async rotateSecret(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.webhooks.rotateSecret({ userId, role, organizationId: orgId }, id));
  }

  @Post('webhooks/:id/test')
  async testFire(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.webhooks.testFire({ userId, role, organizationId: orgId }, id));
  }

  @Delete('webhooks/:id')
  async deleteEndpoint(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.webhooks.deleteEndpoint({ userId, role, organizationId: orgId }, id));
  }

  @Get('webhooks/deliveries')
  async listDeliveries(
    @Query('endpointId') endpointId: string | undefined,
    @Query('take') take: string | undefined,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(
      await this.webhooks.listDeliveries({ userId, role, organizationId: orgId }, endpointId, Number(take) || 50),
    );
  }

  /** Internal cron entrypoint — runs all pending due deliveries. */
  @Post('webhooks/_deliver-pending')
  @Roles('super_admin')
  async deliverPending() {
    return successResponse(await this.webhooks.deliverPending(100));
  }
}
