import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { VotesService } from './votes.service';
import { SurveysService } from './surveys.service';
import { CurrentUser, Roles } from '../common/decorators';
import { successResponse } from '../common/dto';
import { Idempotent, IdempotencyInterceptor } from '../common/idempotency';
import {
  CreateVoteDto,
  CastBallotDto,
  GrantProxyDto,
  CreateSurveyDto,
  SubmitSurveyResponseDto,
  GenerateSurveyDto,
} from './dto/votes.dto';

const ADMIN = ['hoa_admin', 'super_admin'] as const;
const BOARD = ['exco_member', 'exco_chairperson'] as const;
const COMMS = ['communications_manager'] as const;
const RESIDENTS = ['owner', 'tenant'] as const;
const ALL_INSIDERS = ['hoa_admin', 'super_admin', 'property_manager', 'finance_officer', 'exco_member', 'exco_chairperson', 'communications_manager', 'owner', 'tenant'] as const;

@ApiTags('Votes')
@ApiBearerAuth()
@Controller('votes')
@UseInterceptors(IdempotencyInterceptor)
export class VotesController {
  constructor(private service: VotesService) {}

  @Get()
  @Roles(...ALL_INSIDERS)
  async list(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Query() query: { status?: string; type?: string },
  ) {
    return this.service.list(orgId, { userId, role }, query);
  }

  @Get(':id')
  @Roles(...ALL_INSIDERS)
  async findById(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.findById(id, orgId, { userId, role }));
  }

  @Get(':id/results')
  @Roles(...ALL_INSIDERS)
  async results(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.results(id, orgId, { userId, role });
  }

  @Post()
  @Roles(...BOARD, ...ADMIN)
  async create(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: CreateVoteDto,
  ) {
    return successResponse(await this.service.create(orgId, { userId, role }, dto));
  }

  @Put(':id')
  @Roles(...BOARD, ...ADMIN)
  async update(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: Partial<CreateVoteDto>,
  ) {
    return successResponse(await this.service.update(id, orgId, { userId, role }, dto));
  }

  @Post(':id/second')
  @Roles(...BOARD)
  async second(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.second(id, orgId, { userId, role }));
  }

  @Post(':id/open')
  @Roles(...ADMIN)
  async open(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.open(id, orgId, { userId, role }));
  }

  @Post(':id/close')
  @Roles(...ADMIN)
  async close(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.close(id, orgId, { userId, role }));
  }

  @Post(':id/cancel')
  @Roles(...ADMIN)
  async cancel(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() body: { reason?: string },
  ) {
    return successResponse(await this.service.cancel(id, orgId, { userId, role }, body?.reason));
  }

  @Post(':id/ballots')
  @Idempotent()
  @Roles(...RESIDENTS, ...BOARD)
  async cast(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: CastBallotDto,
  ) {
    return successResponse(await this.service.castBallot(id, orgId, { userId, role }, dto));
  }

  @Post(':id/proxies')
  @Roles(...RESIDENTS, ...BOARD)
  async grantProxy(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: GrantProxyDto,
  ) {
    return successResponse(await this.service.grantProxy(id, orgId, { userId, role }, dto));
  }

  @Delete('proxies/:proxyId')
  @Roles(...RESIDENTS, ...BOARD)
  async revokeProxy(
    @Param('proxyId') proxyId: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.revokeProxy(proxyId, orgId, { userId, role }));
  }
}

@ApiTags('Surveys')
@ApiBearerAuth()
@Controller('surveys')
export class SurveysController {
  constructor(private service: SurveysService) {}

  @Get()
  @Roles(...ALL_INSIDERS)
  async list(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.list(orgId, { userId, role }));
  }

  // Declared before ':id' so "templates" isn't captured as an id param.
  @Get('templates')
  @Roles(...ADMIN, ...COMMS, ...BOARD)
  async templates() {
    return successResponse(this.service.templates());
  }

  @Post('generate')
  @Roles(...ADMIN, ...COMMS, ...BOARD)
  async generate(
    @CurrentUser('organizationId') orgId: string,
    @Body() dto: GenerateSurveyDto,
  ) {
    return successResponse(await this.service.generateDraft(orgId, dto));
  }

  @Get(':id')
  @Roles(...ALL_INSIDERS)
  async findById(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.findById(id, orgId, { userId, role }));
  }

  @Get(':id/results')
  @Roles(...ADMIN, ...BOARD)
  async results(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.results(id, orgId, { userId, role });
  }

  @Post()
  @Roles(...ADMIN, ...COMMS)
  async create(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: CreateSurveyDto,
  ) {
    return successResponse(await this.service.create(orgId, { userId, role }, dto));
  }

  @Post(':id/open')
  @Roles(...ADMIN, ...COMMS)
  async open(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.transition(id, orgId, { userId, role }, 'open'));
  }

  @Post(':id/close')
  @Roles(...ADMIN, ...COMMS)
  async close(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.transition(id, orgId, { userId, role }, 'closed'));
  }

  @Post(':id/responses')
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent()
  @Roles(...ALL_INSIDERS)
  async submit(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: SubmitSurveyResponseDto,
  ) {
    return successResponse(await this.service.submit(id, orgId, { userId, role }, dto));
  }
}
