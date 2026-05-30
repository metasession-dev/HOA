import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { VendorPortalService } from './vendor-portal.service';
import { CurrentUser, Roles, OnlyExactRoles } from '../common/decorators';
import { successResponse } from '../common/dto';
import { SubmitVendorInvoiceDto } from './dto/vendors.dto';

/**
 * Self-service portal for external vendors. Strictly vendor-only — admins are
 * NOT auto-elevated here (they have no linked Vendor profile), enforced via
 * @OnlyExactRoles().
 */
@ApiTags('Vendor Portal')
@ApiBearerAuth()
@OnlyExactRoles()
@Roles('vendor')
@Controller('vendor-portal')
export class VendorPortalController {
  constructor(private portal: VendorPortalService) {}

  @Get('me')
  async me(
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.portal.me(userId, orgId));
  }

  @Get('invoices')
  async list(
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.portal.listInvoices(userId, orgId));
  }

  @Get('invoices/:id')
  async get(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.portal.getInvoice(id, userId, orgId));
  }

  @Post('invoices')
  async submit(
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('role') role: string,
    @Body() dto: SubmitVendorInvoiceDto,
  ) {
    return successResponse(await this.portal.submitInvoice(userId, orgId, role, dto));
  }
}
