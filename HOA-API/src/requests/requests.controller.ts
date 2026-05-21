import {
  Controller, Get, Post, Put, Body, Param, Query, UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequestsService } from './requests.service';
import {
  CreateRequestDto, TransitionRequestDto, AssignRequestDto, ChangePriorityDto, CreateCommentDto,
  CreateRequestCategoryDto, UpdateRequestCategoryDto, ListRequestsQueryDto,
} from './dto/requests.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { successResponse } from '../common/dto';
import { Idempotent, IdempotencyInterceptor } from '../common/idempotency';

@ApiTags('Requests')
@ApiBearerAuth()
@Controller('requests')
@UseInterceptors(IdempotencyInterceptor)
export class RequestsController {
  constructor(private requests: RequestsService) {}

  // ---- categories ----

  @Get('categories')
  async listCategories(
    @CurrentUser('organizationId') orgId: string,
    @Query('all') all: string | undefined,
  ) {
    return successResponse(await this.requests.listCategories(orgId, all === 'true'));
  }

  @Post('categories')
  @Roles('hoa_admin', 'property_manager', 'super_admin')
  async createCategory(
    @Body() dto: CreateRequestCategoryDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.requests.createCategory(orgId, { userId, role }, dto));
  }

  @Put('categories/:id')
  @Roles('hoa_admin', 'property_manager', 'super_admin')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateRequestCategoryDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.requests.updateCategory(orgId, { userId, role }, id, dto));
  }

  // ---- requests ----

  @Get('analytics/overdue')
  @Roles('hoa_admin', 'property_manager', 'exco_member', 'exco_chairperson', 'super_admin')
  async overdue(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.requests.overdueSummary(orgId));
  }

  @Get()
  async list(
    @Query() q: ListRequestsQueryDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const r = await this.requests.list(orgId, { userId, role }, q as any);
    return { success: true, data: r.data, meta: r.meta };
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.requests.findById(orgId, { userId, role }, id));
  }

  @Post()
  @Idempotent()
  async create(
    @Body() dto: CreateRequestDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.requests.create(orgId, { userId, role }, dto as any));
  }

  @Post(':id/transition')
  @Idempotent()
  async transition(
    @Param('id') id: string,
    @Body() dto: TransitionRequestDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.requests.transition(orgId, { userId, role }, id, dto.to, dto));
  }

  @Post(':id/assign')
  @Roles('hoa_admin', 'property_manager', 'super_admin')
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignRequestDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.requests.assign(orgId, { userId, role }, id, dto.assignedToUserId ?? null));
  }

  @Post(':id/priority')
  @Roles('hoa_admin', 'property_manager', 'super_admin')
  async changePriority(
    @Param('id') id: string,
    @Body() dto: ChangePriorityDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.requests.changePriority(orgId, { userId, role }, id, dto.priority));
  }

  @Post(':id/comments')
  async addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.requests.addComment(orgId, { userId, role }, id, dto as any));
  }
}
