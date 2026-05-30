import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TendersService } from './tenders.service';
import { CurrentUser, Roles, OnlyExactRoles } from '../common/decorators';
import { successResponse } from '../common/dto';
import {
  CreateTenderDto,
  UpdateTenderDto,
  SubmitBidDto,
  ShortlistBidDto,
  StartExcoVoteDto,
  AwardBidDto,
} from './dto/tenders.dto';

const MANAGE = ['hoa_admin', 'super_admin', 'finance_officer', 'property_manager'] as const;

/** Admin/procurement-facing contract bidding. */
@ApiTags('Tenders')
@ApiBearerAuth()
@Roles(...MANAGE)
@Controller('tenders')
export class TendersController {
  constructor(private tenders: TendersService) {}

  @Post()
  async create(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: CreateTenderDto,
  ) {
    return successResponse(await this.tenders.create(orgId, { userId, role }, dto));
  }

  @Get()
  async list(@CurrentUser('organizationId') orgId: string, @Query('status') status?: string) {
    return successResponse(await this.tenders.list(orgId, { status }));
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.tenders.get(id, orgId));
  }

  @Put(':id')
  async update(@Param('id') id: string, @CurrentUser('organizationId') orgId: string, @Body() dto: UpdateTenderDto) {
    return successResponse(await this.tenders.update(id, orgId, dto));
  }

  @Post(':id/open')
  async open(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.tenders.open(id, orgId, { userId, role }));
  }

  @Post(':id/close')
  async close(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.tenders.close(id, orgId));
  }

  @Post(':id/shortlist')
  async shortlist(@Param('id') id: string, @CurrentUser('organizationId') orgId: string, @Body() dto: ShortlistBidDto) {
    return successResponse(await this.tenders.shortlist(id, orgId, dto));
  }

  @Post(':id/exco-vote')
  async startExcoVote(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: StartExcoVoteDto,
  ) {
    return successResponse(await this.tenders.startExcoVote(id, orgId, { userId, role }, dto));
  }

  @Post(':id/award')
  async award(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: AwardBidDto,
  ) {
    return successResponse(await this.tenders.award(id, orgId, { userId, role }, dto));
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.tenders.cancel(id, orgId));
  }
}

/** Vendor-facing bidding. Strictly vendor-only (no admin auto-elevation). */
@ApiTags('Vendor Portal')
@ApiBearerAuth()
@OnlyExactRoles()
@Roles('vendor')
@Controller('vendor-portal/tenders')
export class VendorTendersController {
  constructor(private tenders: TendersService) {}

  @Get()
  async list(@CurrentUser('sub') userId: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.tenders.listOpenForVendor(userId, orgId));
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser('sub') userId: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.tenders.getForVendor(id, userId, orgId));
  }

  @Post('bids')
  async submitBid(
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') orgId: string,
    @Body() dto: SubmitBidDto,
  ) {
    return successResponse(await this.tenders.submitBid(userId, orgId, dto));
  }
}
