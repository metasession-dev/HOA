import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { UnitsService } from './units.service';
import { CurrentUser, Roles } from '../common/decorators';
import { PaginationDto, successResponse } from '../common/dto';

const UNIT_TYPES = ['apartment', 'townhouse', 'house', 'duplex', 'commercial'] as const;

class CreateUnitDto {
  @IsString() @MaxLength(40) unitNumber: string;
  @IsOptional() @IsString() @MaxLength(40) block?: string;
  @IsOptional() @IsInt() @Min(-5) floor?: number;
  @IsOptional() @IsIn(UNIT_TYPES) type?: (typeof UNIT_TYPES)[number];
}

class UpdateUnitDto {
  @IsOptional() @IsString() @MaxLength(40) unitNumber?: string;
  @IsOptional() @IsString() @MaxLength(40) block?: string;
  @IsOptional() @IsInt() @Min(-5) floor?: number;
  @IsOptional() @IsIn(UNIT_TYPES) type?: (typeof UNIT_TYPES)[number];
}

@ApiTags('Units')
@ApiBearerAuth()
@Controller()
export class UnitsController {
  constructor(private service: UnitsService) {}

  @Get('estates/:estateId/units')
  async findByEstate(@Param('estateId') estateId: string, @Query() query: PaginationDto) {
    return this.service.findByEstate(estateId, query);
  }

  @Get('units/:id')
  async findById(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    const unit = await this.service.findById(id, orgId);
    return successResponse(unit);
  }

  @Roles('property_manager')
  @Post('estates/:estateId/units')
  async create(@Param('estateId') estateId: string, @Body() data: CreateUnitDto) {
    const unit = await this.service.create(estateId, data);
    return successResponse(unit);
  }

  @Roles('property_manager')
  @Put('units/:id')
  async update(@Param('id') id: string, @Body() data: UpdateUnitDto) {
    const unit = await this.service.update(id, data);
    return successResponse(unit);
  }
}
