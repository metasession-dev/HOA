import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseInterceptors,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import { VendorInvoicesService } from './vendor-invoices.service';
import { ApprovalRulesService } from './approval-rules.service';
import { CurrentUser, Roles } from '../common/decorators';
import { successResponse } from '../common/dto';
import { Idempotent, IdempotencyInterceptor } from '../common/idempotency';
import {
  CreateVendorDto,
  UpdateVendorDto,
  ChangeVendorStatusDto,
  VendorDocumentDto,
  CreateVendorInvoiceDto,
  UpdateVendorInvoiceDto,
  DecideApprovalDto,
  RejectInvoiceDto,
  PayInvoiceDto,
  BatchPayDto,
  CreateApprovalRuleDto,
  UpdateApprovalRuleDto,
} from './dto/vendors.dto';

const ADMIN = ['hoa_admin', 'super_admin'] as const;
const FINANCE = ['finance_officer'] as const;
const BOARD = ['exco_member', 'exco_chairperson'] as const;

@ApiTags('Vendors')
@ApiBearerAuth()
@Controller('vendors')
export class VendorsController {
  constructor(private service: VendorsService) {}

  @Get()
  @Roles(...ADMIN, ...FINANCE, ...BOARD)
  async list(
    @CurrentUser('organizationId') orgId: string,
    @Query() query: { status?: string; search?: string },
  ) {
    return successResponse(await this.service.list(orgId, query));
  }

  @Get('expiring-documents')
  @Roles(...ADMIN, ...FINANCE)
  async expiringDocs(
    @CurrentUser('organizationId') orgId: string,
    @Query('days') days?: string,
  ) {
    return successResponse(
      await this.service.expiringDocuments(orgId, days ? Number(days) : 30),
    );
  }

  @Get(':id')
  @Roles(...ADMIN, ...FINANCE, ...BOARD)
  async findById(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.service.findById(id, orgId));
  }

  @Post()
  @Roles(...ADMIN, ...FINANCE)
  async create(
    @Body() dto: CreateVendorDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.service.create(orgId, { userId, role }, dto),
    );
  }

  @Put(':id')
  @Roles(...ADMIN, ...FINANCE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateVendorDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.service.update(id, orgId, { userId, role }, dto),
    );
  }

  @Post(':id/status')
  @Roles(...ADMIN)
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeVendorStatusDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.service.changeStatus(id, orgId, { userId, role }, dto),
    );
  }

  @Post(':id/documents')
  @Roles(...ADMIN, ...FINANCE)
  async attachDoc(
    @Param('id') id: string,
    @Body() doc: VendorDocumentDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.service.attachDocument(id, orgId, { userId, role }, doc),
    );
  }
}

@ApiTags('Vendor Invoices')
@ApiBearerAuth()
@Controller('vendor-invoices')
@UseInterceptors(IdempotencyInterceptor)
export class VendorInvoicesController {
  constructor(private service: VendorInvoicesService) {}

  @Get()
  @Roles(...ADMIN, ...FINANCE, ...BOARD)
  async list(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Query() query: { status?: string; vendorId?: string; from?: string; to?: string; search?: string; mineToApprove?: string },
  ) {
    return successResponse(
      await this.service.list(orgId, { ...query, actorUserId: userId, actorRole: role }),
    );
  }

  @Get('aging-report')
  @Roles(...ADMIN, ...FINANCE)
  async aging(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.service.agingReport(orgId));
  }

  @Get(':id')
  @Roles(...ADMIN, ...FINANCE, ...BOARD)
  async findById(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.service.findById(id, orgId));
  }

  @Post()
  @Idempotent()
  @Roles(...ADMIN, ...FINANCE)
  async create(
    @Body() dto: CreateVendorInvoiceDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.service.create(orgId, { userId, role }, dto),
    );
  }

  @Put(':id')
  @Roles(...ADMIN, ...FINANCE)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateVendorInvoiceDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.service.update(id, orgId, { userId, role }, dto),
    );
  }

  @Post(':id/approve')
  @Idempotent()
  @Roles(...ADMIN, ...FINANCE, ...BOARD)
  async approve(
    @Param('id') id: string,
    @Body() dto: DecideApprovalDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.service.approve(id, orgId, { userId, role }, dto),
    );
  }

  @Post(':id/reject')
  @Idempotent()
  @Roles(...ADMIN, ...FINANCE, ...BOARD)
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectInvoiceDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.service.reject(id, orgId, { userId, role }, dto),
    );
  }

  @Post(':id/pay')
  @Idempotent()
  @Roles(...ADMIN, ...FINANCE)
  async pay(
    @Param('id') id: string,
    @Body() dto: PayInvoiceDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.service.pay(id, orgId, { userId, role }, dto),
    );
  }

  @Post('batch-pay')
  @Idempotent()
  @Roles(...ADMIN, ...FINANCE)
  async batchPay(
    @Body() dto: BatchPayDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.service.batchPay(orgId, { userId, role }, dto),
    );
  }

  @Post(':id/cancel')
  @Idempotent()
  @Roles(...ADMIN, ...FINANCE)
  async cancel(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.service.cancel(id, orgId, { userId, role }, body.reason || 'No reason given'),
    );
  }
}

@ApiTags('Approval Rules')
@ApiBearerAuth()
@Controller('approval-rules')
export class ApprovalRulesController {
  constructor(private service: ApprovalRulesService) {}

  @Get()
  @Roles(...ADMIN, ...FINANCE)
  async list(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.service.list(orgId));
  }

  @Get(':id')
  @Roles(...ADMIN, ...FINANCE)
  async findById(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.service.findById(id, orgId));
  }

  @Post()
  @Roles(...ADMIN)
  async create(
    @Body() dto: CreateApprovalRuleDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.service.create(orgId, { userId, role }, dto),
    );
  }

  @Put(':id')
  @Roles(...ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateApprovalRuleDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.service.update(id, orgId, { userId, role }, dto),
    );
  }

  @Delete(':id')
  @Roles(...ADMIN)
  async remove(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.service.remove(id, orgId, { userId, role }),
    );
  }
}
