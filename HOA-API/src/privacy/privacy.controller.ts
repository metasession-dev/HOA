import {
  Controller, Get, Post, Delete, Body, Param, Req, BadRequestException,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PrivacyService } from './privacy.service';
import {
  RequestExportDto, SubmitErasureDto, ModerateErasureDto, RecordConsentDto,
} from './dto/privacy.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { successResponse } from '../common/dto';
import { Idempotent, IdempotencyInterceptor } from '../common/idempotency';

function ctxFrom(req: Request) {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress;
  return { ip, userAgent: req.headers['user-agent'] };
}

@ApiTags('Privacy')
@ApiBearerAuth()
@Controller('privacy')
@UseInterceptors(IdempotencyInterceptor)
export class PrivacyController {
  constructor(private privacy: PrivacyService) {}

  // ============== EXPORT ==============

  @Post('exports')
  @Idempotent()
  async requestExport(
    @Body() dto: RequestExportDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') currentOrgId: string,
  ) {
    const target = dto.targetUserId || userId;
    const orgId = dto.organizationId ?? currentOrgId;
    return successResponse(
      await this.privacy.requestExport(target, { userId, role, organizationId: currentOrgId }, orgId),
    );
  }

  @Get('exports')
  async listExports(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.privacy.listExports({ userId, role }));
  }

  @Get('exports/:id')
  async getExport(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') currentOrgId: string,
  ) {
    return successResponse(await this.privacy.getExport(id, { userId, role, organizationId: currentOrgId }));
  }

  @Get('exports/:id/download')
  async downloadExport(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') currentOrgId: string,
  ) {
    return successResponse(await this.privacy.downloadExport(id, { userId, role, organizationId: currentOrgId }));
  }

  // ============== ERASURE ==============

  @Post('erasure')
  @Idempotent()
  async submitErasure(
    @Body() dto: SubmitErasureDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') currentOrgId: string,
  ) {
    const target = dto.targetUserId || userId;
    return successResponse(
      await this.privacy.submitErasure(target, { userId, role, organizationId: currentOrgId }, {
        reason: dto.reason,
        organizationId: dto.organizationId,
      }),
    );
  }

  @Get('erasure')
  async listMyErasure(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.privacy.listErasure({ userId, role }));
  }

  @Delete('erasure/:id')
  async cancelErasure(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.privacy.cancelErasure(id, { userId, role }));
  }

  /** Admin-only: approve or reject a submitted erasure request. */
  @Post('erasure/:id/moderate')
  @Roles('hoa_admin', 'super_admin')
  async moderateErasure(
    @Param('id') id: string,
    @Body() dto: ModerateErasureDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') currentOrgId: string,
  ) {
    if (dto.decision === 'rejected' && !dto.reason) {
      throw new BadRequestException('reason is required when rejecting an erasure request');
    }
    return successResponse(
      await this.privacy.moderateErasure(id, { userId, role, organizationId: currentOrgId }, dto.decision, dto.reason),
    );
  }

  /** Admin-only: execute an approved erasure after the waiting window. */
  @Post('erasure/:id/execute')
  @Roles('hoa_admin', 'super_admin')
  @Idempotent()
  async executeErasure(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') currentOrgId: string,
  ) {
    return successResponse(await this.privacy.executeErasure(id, { userId, role, organizationId: currentOrgId }));
  }

  // ============== CONSENT ==============

  @Post('consent')
  async recordConsent(
    @Body() dto: RecordConsentDto,
    @Req() req: Request,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') currentOrgId: string,
  ) {
    return successResponse(
      await this.privacy.recordConsent(
        { userId, role, organizationId: currentOrgId },
        dto,
        ctxFrom(req),
      ),
    );
  }

  @Get('consent')
  async listMyConsents(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.privacy.listMyConsents({ userId, role }));
  }

  @Get('consent/current')
  async currentConsents(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.privacy.currentConsents({ userId, role }));
  }
}
