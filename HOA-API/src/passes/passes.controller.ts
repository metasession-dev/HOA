import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PassesService } from './passes.service';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { PaginationDto, successResponse } from '../common/dto';
import { CreatePassDto } from './dto/create-pass.dto';
import { LogEntryDto, VerifyCodeDto, DenyEntryDto } from './dto/log-entry.dto';

const GATE_ROLES = ['gate_security', 'property_manager'];

@ApiTags('Gate Passes')
@Controller('passes')
export class PassesController {
  constructor(private service: PassesService) {}

  // ----- Public (visitor-facing) -----

  // Visitor lookup by short code — public, no auth. Capped per IP so a
  // bot can't brute-force the (relatively short) gate-pass code space.
  // Real gate use only hits this a handful of times per minute.
  @Public()
  @Throttle({ short: { limit: 10, ttl: 1000 }, medium: { limit: 60, ttl: 60_000 } })
  @Get('public/:code')
  async findPublicByCode(@Param('code') code: string) {
    const pass = await this.service.findPublicByCode(code);
    return successResponse(pass);
  }

  // ----- Authenticated user (resident or admin) -----

  @ApiBearerAuth()
  @Post()
  async create(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: CreatePassDto,
  ) {
    const pass = await this.service.create(orgId, { userId, role }, dto);
    return successResponse(pass);
  }

  @ApiBearerAuth()
  @Get()
  async findAll(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Query() query: PaginationDto & { status?: string; type?: string },
  ) {
    return this.service.findAll(orgId, { userId, role }, query);
  }

  @ApiBearerAuth()
  @Get(':id')
  async findById(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const pass = await this.service.findById(id, orgId, { userId, role });
    return successResponse(pass);
  }

  @ApiBearerAuth()
  @Post(':id/revoke')
  async revoke(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const pass = await this.service.revoke(id, orgId, { userId, role });
    return successResponse(pass);
  }

  // ----- Gate operator endpoints -----

  @ApiBearerAuth()
  @Roles(...GATE_ROLES)
  @Post('gate/verify')
  async verifyForGate(
    @CurrentUser('organizationId') orgId: string,
    @Body() dto: VerifyCodeDto,
  ) {
    const pass = await this.service.verifyForGate(dto.code, orgId);
    return successResponse(pass);
  }

  @ApiBearerAuth()
  @Roles(...GATE_ROLES)
  @Post(':id/entry')
  async logEntry(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: LogEntryDto,
  ) {
    const result = await this.service.logEntry(id, orgId, { userId, role }, dto);
    return successResponse(result);
  }

  @ApiBearerAuth()
  @Roles(...GATE_ROLES)
  @Post(':id/exit')
  async logExit(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: LogEntryDto,
  ) {
    const log = await this.service.logExit(id, orgId, { userId, role }, dto);
    return successResponse(log);
  }

  @ApiBearerAuth()
  @Roles(...GATE_ROLES)
  @Post(':id/deny')
  async logDeny(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: DenyEntryDto,
  ) {
    const log = await this.service.logDeny(id, orgId, { userId, role }, dto.reason);
    return successResponse(log);
  }
}

@ApiTags('Visitor Logs')
@ApiBearerAuth()
@Roles(...GATE_ROLES)
@Controller('visitor-logs')
export class VisitorLogsController {
  constructor(private service: PassesService) {}

  @Get('today')
  async getToday(@CurrentUser('organizationId') orgId: string) {
    return this.service.getTodayLogs(orgId);
  }

  @Get()
  async findAll(
    @CurrentUser('organizationId') orgId: string,
    @Query() query: PaginationDto & { from?: string; to?: string; unitId?: string },
  ) {
    return this.service.getLogs(orgId, query);
  }
}
