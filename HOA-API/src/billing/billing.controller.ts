import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RecurringInvoicesService } from './recurring.service';
import { LateFeesService } from './late-fees.service';
import { PaymentPlansService } from './payment-plans.service';
import { BillingCatalogService } from './billing-catalog.service';
import { UnitBillingService } from './unit-billing.service';
import {
  CreateRecurringScheduleDto, UpdateRecurringScheduleDto, UpsertLateFeeConfigDto,
  CreatePaymentPlanDto, CancelPaymentPlanDto,
  CreateBillingTypeDto, UpdateBillingTypeDto,
  AttachUnitBillingDto, UpdateUnitBillingDto, BulkActivateBillingDto, BillingActivationTargetDto,
} from './dto/billing.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { successResponse } from '../common/dto';
import { Idempotent, IdempotencyInterceptor } from '../common/idempotency';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
@UseInterceptors(IdempotencyInterceptor)
export class BillingController {
  constructor(
    private recurring: RecurringInvoicesService,
    private lateFees: LateFeesService,
    private plans: PaymentPlansService,
    private catalog: BillingCatalogService,
    private unitBilling: UnitBillingService,
  ) {}

  // ============ Billing catalog (Phase 1 of unit-default-billing) ============

  @Get('catalog')
  @Roles('hoa_admin', 'finance_officer', 'property_manager', 'super_admin')
  async listBillingTypes(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.catalog.list(orgId));
  }

  @Post('catalog')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  async createBillingType(
    @Body() dto: CreateBillingTypeDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.catalog.create(orgId, { userId, role }, dto as any));
  }

  @Put('catalog/:id')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  async updateBillingType(
    @Param('id') id: string,
    @Body() dto: UpdateBillingTypeDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.catalog.update(orgId, { userId, role }, id, dto as any));
  }

  @Delete('catalog/:id')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  async archiveBillingType(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.catalog.archive(orgId, { userId, role }, id));
  }

  // ============ Per-unit billing attachments (Phase 2) ============

  @Get('units/:unitId/billings')
  @Roles('hoa_admin', 'finance_officer', 'property_manager', 'super_admin')
  async listUnitBillings(@Param('unitId') unitId: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.unitBilling.listForUnit(orgId, unitId));
  }

  @Post('units/:unitId/billings')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  async attachUnitBilling(
    @Param('unitId') unitId: string,
    @Body() dto: AttachUnitBillingDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.unitBilling.attach(orgId, { userId, role }, unitId, dto.billingTypeId, dto.amount));
  }

  @Put('unit-billings/:id')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  async updateUnitBilling(
    @Param('id') id: string,
    @Body() dto: UpdateUnitBillingDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.unitBilling.update(orgId, { userId, role }, id, dto));
  }

  @Post('catalog/:id/activation-preview')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  async previewBillingActivation(
    @Param('id') id: string,
    @Body() target: BillingActivationTargetDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.unitBilling.previewBulk(orgId, id, target || {}));
  }

  @Post('catalog/:id/bulk-activate')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  @Idempotent()
  async bulkActivateBilling(
    @Param('id') id: string,
    @Body() dto: BulkActivateBillingDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.unitBilling.bulkActivate(orgId, { userId, role }, id, {
      target: dto.target || {},
      active: dto.active,
      attachIfMissing: dto.attachIfMissing,
    }));
  }

  // ============ Per-charge generation (Phase 3) ============

  @Post('catalog/:id/generate-preview')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  async previewGenerate(
    @Param('id') id: string,
    @Body() body: { periodOverride?: string },
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.unitBilling.previewGeneration(orgId, id, body || {}));
  }

  @Post('catalog/:id/generate')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  @Idempotent()
  async generateCharges(
    @Param('id') id: string,
    @Body() body: { periodOverride?: string },
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.unitBilling.generateForType(orgId, { userId, role }, id, body || {}));
  }

  @Post('generate-charges-due')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  @Idempotent()
  async generateChargesDue(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.unitBilling.generateDue(orgId, { userId, role }));
  }

  // ============ Recurring schedules ============

  @Get('recurring')
  @Roles('hoa_admin', 'finance_officer', 'property_manager', 'super_admin')
  async listSchedules(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.recurring.list(orgId));
  }

  @Get('recurring/:id')
  @Roles('hoa_admin', 'finance_officer', 'property_manager', 'super_admin')
  async getSchedule(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.recurring.findById(orgId, id));
  }

  @Post('recurring')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  async createSchedule(
    @Body() dto: CreateRecurringScheduleDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.recurring.create(orgId, { userId, role }, dto as any));
  }

  @Put('recurring/:id')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  async updateSchedule(
    @Param('id') id: string,
    @Body() dto: UpdateRecurringScheduleDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.recurring.update(orgId, { userId, role }, id, dto as any));
  }

  @Get('recurring/:id/preview')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  async previewSchedule(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.recurring.preview(orgId, id));
  }

  @Post('recurring/:id/run')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  @Idempotent()
  async runSchedule(
    @Param('id') id: string,
    @Body() body: { periodOverride?: string },
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.recurring.run(orgId, { userId, role }, id, body || {}));
  }

  @Post('recurring/run-due')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  async runDueSchedules(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.recurring.runDueSchedules(orgId, { userId, role }));
  }

  // ============ Late fees ============

  @Get('late-fees/config')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  async getLateFeeConfig(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.lateFees.getConfig(orgId));
  }

  @Post('late-fees/config')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  async upsertLateFeeConfig(
    @Body() dto: UpsertLateFeeConfigDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.lateFees.upsertConfig(orgId, { userId, role }, dto as any));
  }

  @Get('late-fees/preview-sweep')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  async previewSweep(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.lateFees.previewSweep(orgId));
  }

  @Post('late-fees/sweep')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  @Idempotent()
  async runSweep(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.lateFees.sweep(orgId, { userId, role }));
  }

  // ============ Payment plans ============

  @Get('payment-plans')
  async listPlans(
    @Query('status') status: string | undefined,
    @Query('unitId') unitId: string | undefined,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.plans.list(orgId, { userId, role }, { status, unitId }));
  }

  @Get('payment-plans/:id')
  async getPlan(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.plans.findById(orgId, { userId, role }, id));
  }

  @Post('payment-plans')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  @Idempotent()
  async createPlan(
    @Body() dto: CreatePaymentPlanDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.plans.create(orgId, { userId, role }, dto as any));
  }

  @Post('payment-plans/:id/activate')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  @Idempotent()
  async activatePlan(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.plans.activate(orgId, { userId, role }, id));
  }

  @Post('payment-plans/:id/cancel')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  async cancelPlan(
    @Param('id') id: string,
    @Body() dto: CancelPaymentPlanDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.plans.cancel(orgId, { userId, role }, id, dto?.reason));
  }

  @Post('payment-plans/materialize-due')
  @Roles('hoa_admin', 'finance_officer', 'super_admin')
  async materializeDue(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.plans.materializeDueInstallments(orgId, { userId, role }));
  }
}
