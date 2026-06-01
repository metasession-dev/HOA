import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { InvoicesService } from './invoices.service';
import { CurrentUser, Roles } from '../common/decorators';
import { PaginationDto, successResponse } from '../common/dto';

class InvoiceLineDto {
  @IsString() @MaxLength(500) description: string;
  @IsNumber() quantity: number;
  @IsNumber() unitPrice: number;
  @IsOptional() @IsString() glAccountId?: string;
}

class CreateInvoiceDto {
  @IsString() unitId: string;
  @IsOptional() @IsIn(['levy', 'special', 'fine', 'utility', 'maintenance', 'other']) type?: string;
  @IsDateString() dueDate: string;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceLineDto)
  lineItems: InvoiceLineDto[];
}

class BulkDeleteInvoicesDto {
  @IsArray() @IsString({ each: true }) ids: string[];
}

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private service: InvoicesService) {}

  @Get()
  async findAll(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Query() query: PaginationDto & { status?: string; unitId?: string },
  ) {
    return this.service.findAll(orgId, query, { userId, role });
  }

  // Dashboard aggregates. Declared before :id so "stats" isn't read as an id.
  @Get('stats')
  async stats(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Query('months') months?: string,
  ) {
    const stats = await this.service.stats(orgId, { userId, role }, { months: months ? Number(months) : undefined });
    return successResponse(stats);
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const invoice = await this.service.findById(id, orgId, { userId, role });
    return successResponse(invoice);
  }

  @Roles('finance_officer')
  @Post()
  async create(@CurrentUser('organizationId') orgId: string, @CurrentUser('sub') userId: string, @Body() data: CreateInvoiceDto) {
    const invoice = await this.service.create(orgId, userId, data);
    return successResponse(invoice);
  }

  @Roles('finance_officer')
  @Post(':id/send')
  async send(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    const invoice = await this.service.send(id, orgId);
    return successResponse(invoice);
  }

  @Roles('finance_officer')
  @Post(':id/void')
  async void(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    const invoice = await this.service.void(id, orgId);
    return successResponse(invoice);
  }

  // Delete one or more UNPAID invoices at once (e.g. clearing erroneous /
  // abandoned-prepay bills). Only invoices with no money received are removed.
  @Roles('finance_officer')
  @Post('bulk-delete')
  async bulkDelete(
    @Body() body: BulkDeleteInvoicesDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.bulkDeleteUnpaid(orgId, { userId, role }, body.ids));
  }
}
