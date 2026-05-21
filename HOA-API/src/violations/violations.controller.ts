import { Controller, Get, Post, Put, Body, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ViolationsService } from './violations.service';
import { CurrentUser, Roles } from '../common/decorators';
import { PaginationDto, successResponse } from '../common/dto';
import { IdempotencyInterceptor, Idempotent } from '../common/idempotency';
import {
  CreateViolationDto,
  CreateCategoryDto,
  IssueNoticeDto,
  IssueFineDto,
  ResolveViolationDto,
  CreateAppealDto,
  DecideAppealDto,
} from './dto/create-violation.dto';

const ADMIN_ROLES = ['property_manager'] as const;
const FINANCE_ROLES = ['finance_officer'] as const;
const BOARD_ROLES = ['exco_member', 'exco_chairperson'] as const;
const RESIDENT_ROLES = ['owner', 'tenant'] as const;
const ALL_INSIDERS = [
  ...ADMIN_ROLES, ...FINANCE_ROLES, ...BOARD_ROLES, ...RESIDENT_ROLES,
] as const;

@ApiTags('Violations')
@ApiBearerAuth()
@Controller('violations')
@UseInterceptors(IdempotencyInterceptor)
export class ViolationsController {
  constructor(private service: ViolationsService) {}

  // ----- Categories -----

  @Get('categories')
  @Roles(...ADMIN_ROLES)
  async listCategories(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.service.listCategories(orgId));
  }

  @Post('categories')
  @Roles(...ADMIN_ROLES)
  async createCategory(
    @CurrentUser('organizationId') orgId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return successResponse(await this.service.createCategory(orgId, dto));
  }

  @Put('categories/:id')
  @Roles(...ADMIN_ROLES)
  async updateCategory(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @Body() dto: Partial<CreateCategoryDto>,
  ) {
    return successResponse(await this.service.updateCategory(id, orgId, dto));
  }

  // ----- Analytics -----

  @Get('analytics/by-unit')
  @Roles(...ADMIN_ROLES)
  async byUnit(@CurrentUser('organizationId') orgId: string) {
    return this.service.byUnit(orgId);
  }

  @Get('analytics/by-category')
  @Roles(...ADMIN_ROLES)
  async byCategory(@CurrentUser('organizationId') orgId: string) {
    return this.service.byCategory(orgId);
  }

  // ----- Violations -----

  @Get()
  @Roles(...ALL_INSIDERS)
  async list(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Query() query: PaginationDto & {
      status?: string;
      unitId?: string;
      categoryId?: string;
      from?: string;
      to?: string;
    },
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

  @Post()
  @Roles(...ADMIN_ROLES)
  @Idempotent()
  async create(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: CreateViolationDto,
  ) {
    return successResponse(await this.service.create(orgId, { userId, role }, dto));
  }

  @Post(':id/notice')
  @Roles(...ADMIN_ROLES)
  async issueNotice(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: IssueNoticeDto,
  ) {
    return successResponse(await this.service.issueNotice(id, orgId, { userId, role }, dto));
  }

  @Post(':id/fine')
  @Roles(...ADMIN_ROLES, ...FINANCE_ROLES)
  @Idempotent()
  async issueFine(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: IssueFineDto,
  ) {
    return successResponse(await this.service.issueFine(id, orgId, { userId, role }, dto));
  }

  @Post(':id/acknowledge')
  @Roles(...RESIDENT_ROLES)
  async acknowledge(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.acknowledge(id, orgId, { userId, role }));
  }

  @Post(':id/resolve')
  @Roles(...ADMIN_ROLES)
  async resolve(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: ResolveViolationDto,
  ) {
    return successResponse(await this.service.resolve(id, orgId, { userId, role }, dto));
  }

  // ----- Appeals -----

  @Post(':id/appeals')
  @Idempotent()
  @Roles(...RESIDENT_ROLES)
  async submitAppeal(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: CreateAppealDto,
  ) {
    return successResponse(await this.service.submitAppeal(id, orgId, { userId, role }, dto));
  }

  @Post('appeals/:id/decide')
  @Roles(...BOARD_ROLES)
  async decideAppeal(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: DecideAppealDto,
  ) {
    return successResponse(await this.service.decideAppeal(id, orgId, { userId, role }, dto));
  }
}
