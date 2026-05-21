import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { EstatesService } from './estates.service';
import { CurrentUser, Roles } from '../common/decorators';
import { PaginationDto, successResponse } from '../common/dto';

class CreateEstateDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsInt() @Min(0) totalUnits?: number;
}

class UpdateEstateDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsInt() @Min(0) totalUnits?: number;
}

@ApiTags('Estates')
@ApiBearerAuth()
@Controller('estates')
export class EstatesController {
  constructor(private service: EstatesService) {}

  @Get()
  async findAll(@CurrentUser('organizationId') orgId: string, @Query() query: PaginationDto) {
    return this.service.findAll(orgId, query);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    const estate = await this.service.findById(id, orgId);
    return successResponse(estate);
  }

  @Roles('property_manager')
  @Post()
  async create(@CurrentUser('organizationId') orgId: string, @Body() data: CreateEstateDto) {
    const estate = await this.service.create(orgId, data);
    return successResponse(estate);
  }

  @Roles('property_manager')
  @Put(':id')
  async update(@Param('id') id: string, @CurrentUser('organizationId') orgId: string, @Body() data: UpdateEstateDto) {
    const estate = await this.service.update(id, orgId, data);
    return successResponse(estate);
  }

  @Roles('property_manager')
  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    await this.service.delete(id, orgId);
    return successResponse({ deleted: true });
  }
}
