import {
  Controller, Get, Post, Put, Body, Param, Query, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CommunicationsService } from './communications.service';
import { BroadcastsService } from './broadcasts.service';
import { CurrentUser, Roles, Public } from '../common/decorators';
import { PaginationDto, successResponse } from '../common/dto';
import { Idempotent, IdempotencyInterceptor } from '../common/idempotency';

class CreateBroadcastLegacyDto {
  @IsString() @MaxLength(200) subject: string;
  @IsString() @MaxLength(50_000) body: string;
  @IsOptional() @IsIn(['email', 'sms', 'whatsapp', 'push', 'in_app']) channel?: string;
  // The admin UI posts a `channels` array (one or more of the supported
  // channels). Kept alongside the singular `channel` for backward compat;
  // the service reads `data.channels` and falls back to ['email'].
  @IsOptional() @IsArray() @IsString({ each: true })
  @IsIn(['email', 'sms', 'whatsapp', 'push', 'in_app'], { each: true })
  channels?: string[];
  @IsOptional() @IsString() @MaxLength(40) audience?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) unitIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) estateIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) personIds?: string[];
  @IsOptional() @IsString() scheduledFor?: string;
}

@ApiTags('Communications')
@ApiBearerAuth()
@Controller('communications')
@UseInterceptors(IdempotencyInterceptor)
export class CommunicationsController {
  constructor(private service: CommunicationsService, private broadcasts: BroadcastsService) {}

  // ============ Legacy broadcast surface (Phase 2.0) ============

  @Get('broadcasts')
  async findAll(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('role') role: string,
    @Query() query: PaginationDto,
  ) {
    return this.service.findAll(orgId, query, role);
  }

  @Roles('communications_manager', 'hoa_admin', 'super_admin')
  @Post('broadcasts')
  async createLegacy(@CurrentUser('organizationId') orgId: string, @CurrentUser('sub') userId: string, @Body() data: CreateBroadcastLegacyDto) {
    const broadcast = await this.service.create(orgId, userId, data);
    return successResponse(broadcast);
  }

  // ============ Phase 2.5 Broadcast 2.0 ============

  @Get('broadcasts/v2')
  @Roles('communications_manager', 'hoa_admin', 'super_admin')
  async listV2(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.broadcasts.list(orgId));
  }

  @Get('broadcasts/v2/:id')
  @Roles('communications_manager', 'hoa_admin', 'super_admin')
  async getV2(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.broadcasts.findById(orgId, id));
  }

  @Post('broadcasts/v2')
  @Roles('communications_manager', 'hoa_admin', 'super_admin')
  async createV2(
    @Body() dto: any,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.broadcasts.create(orgId, { userId, role }, dto));
  }

  @Put('broadcasts/v2/:id')
  @Roles('communications_manager', 'hoa_admin', 'super_admin')
  async updateV2(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.broadcasts.update(orgId, { userId, role }, id, dto));
  }

  @Get('broadcasts/v2/:id/preview')
  @Roles('communications_manager', 'hoa_admin', 'super_admin')
  async previewV2(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.broadcasts.preview(orgId, id));
  }

  @Post('broadcasts/v2/:id/schedule')
  @Roles('communications_manager', 'hoa_admin', 'super_admin')
  async scheduleV2(
    @Param('id') id: string,
    @Body() body: { scheduledAt?: string },
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.broadcasts.schedule(orgId, { userId, role }, id, body?.scheduledAt));
  }

  @Post('broadcasts/v2/:id/send')
  @Roles('communications_manager', 'hoa_admin', 'super_admin')
  @Idempotent()
  async sendV2(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.broadcasts.sendNow(orgId, { userId, role }, id));
  }

  @Post('broadcasts/v2/:id/cancel')
  @Roles('communications_manager', 'hoa_admin', 'super_admin')
  async cancelV2(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.broadcasts.cancel(orgId, { userId, role }, id));
  }

  @Roles('communications_manager', 'hoa_admin', 'super_admin')
  @Post('broadcasts/:id/send')
  async sendLegacy(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    const broadcast = await this.service.send(id, orgId);
    return successResponse(broadcast);
  }

  // ============ Public unsubscribe ============

  /**
   * Public unsubscribe — no auth, just the HMAC token. Throttled because
   * scrapers will hammer this. Idempotent: a second hit returns alreadyOptedOut.
   */
  @Public()
  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 60, ttl: 60_000 } })
  @Post('broadcasts/unsubscribe')
  async unsubscribe(@Body() body: { token: string }) {
    if (!body?.token) throw new BadRequestException('token is required');
    return successResponse(await this.broadcasts.recordOptOut(body.token));
  }
}
