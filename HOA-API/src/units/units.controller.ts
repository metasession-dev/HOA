import { Controller, Get, Post, Put, Delete, Body, Param, Query, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnitsService } from './units.service';
import { CurrentUser, Roles } from '../common/decorators';
import { isResidentRole } from '../common/scope.util';
import { PaginationDto, successResponse } from '../common/dto';

// Units management is a staff surface. Residents (owners/tenants) use
// /me/units for their own units — they must not be able to enumerate the
// estate roster (names, occupancy, household PII) via these endpoints.
function assertStaff(role: string) {
  if (isResidentRole(role)) {
    throw new ForbiddenException('Not available to residents');
  }
}

const UNIT_TYPES = ['apartment', 'townhouse', 'house', 'duplex', 'commercial'] as const;
const ACQUISITION_METHODS = ['initial', 'purchase', 'transfer', 'inheritance', 'gift', 'other'] as const;
const GENDERS = ['male', 'female', 'other', 'undisclosed'] as const;
const RELATIONSHIPS = ['spouse', 'partner', 'child', 'parent', 'sibling', 'relative', 'domestic_staff', 'other'] as const;
const AGE_GROUPS = ['infant', 'child', 'teenager', 'adult', 'senior'] as const;

class CreateUnitDto {
  @IsString() @MaxLength(40) unitNumber: string;
  @IsOptional() @IsString() @MaxLength(40) block?: string;
  @IsOptional() @IsString() @MaxLength(120) street?: string;
  @IsOptional() @IsInt() @Min(-5) floor?: number;
  @IsOptional() @IsIn(UNIT_TYPES) type?: (typeof UNIT_TYPES)[number];
}

class UpdateUnitDto {
  @IsOptional() @IsString() @MaxLength(40) unitNumber?: string;
  @IsOptional() @IsString() @MaxLength(40) block?: string;
  @IsOptional() @IsString() @MaxLength(120) street?: string;
  @IsOptional() @IsInt() @Min(-5) floor?: number;
  @IsOptional() @IsIn(UNIT_TYPES) type?: (typeof UNIT_TYPES)[number];
}

class SetOwnerDto {
  @IsString() personId: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsIn(ACQUISITION_METHODS) acquisitionMethod?: (typeof ACQUISITION_METHODS)[number];
  @IsOptional() @IsNumber() purchasePrice?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

class AdditionalOccupantDto {
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsIn(GENDERS) gender?: (typeof GENDERS)[number];
  @IsOptional() @IsIn(RELATIONSHIPS) relationship?: (typeof RELATIONSHIPS)[number];
  @IsOptional() @IsIn(AGE_GROUPS) ageGroup?: (typeof AGE_GROUPS)[number];
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

class BulkUnitRowDto {
  @IsOptional() @IsString() @MaxLength(40) unitNumber?: string;
  @IsOptional() @IsString() @MaxLength(40) block?: string;
  @IsOptional() @IsString() @MaxLength(120) street?: string;
  @IsOptional() floor?: number | string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() ownerEmail?: string;
}

class BulkCreateUnitsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => BulkUnitRowDto) rows: BulkUnitRowDto[];
}

@ApiTags('Units')
@ApiBearerAuth()
@Controller()
export class UnitsController {
  constructor(private service: UnitsService) {}

  // Org-level list — every unit across the enterprise's estate(s). Powers the
  // admin "Units" page.
  @Get('units')
  async findAll(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('role') role: string,
    @Query() query: PaginationDto & { estateId?: string },
  ) {
    assertStaff(role);
    return this.service.findAllForOrg(orgId, query);
  }

  @Get('estates/:estateId/units')
  async findByEstate(
    @Param('estateId') estateId: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('role') role: string,
    @Query() query: PaginationDto,
  ) {
    assertStaff(role);
    // Org-scope by estate so an estate id from another org can't be enumerated.
    return this.service.findByEstate(estateId, query, orgId);
  }

  @Get('units/:id')
  async findById(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('role') role: string,
  ) {
    assertStaff(role);
    const unit = await this.service.findById(id, orgId);
    return successResponse(unit);
  }

  @Roles('property_manager')
  @Post('estates/:estateId/units')
  async create(
    @Param('estateId') estateId: string,
    @Body() data: CreateUnitDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const unit = await this.service.create(estateId, data, { orgId, userId });
    return successResponse(unit);
  }

  @Roles('property_manager')
  @Post('estates/:estateId/units/bulk')
  async bulkCreate(
    @Param('estateId') estateId: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @Body() data: BulkCreateUnitsDto,
  ) {
    const result = await this.service.bulkCreate(estateId, orgId, data.rows as any, userId);
    return successResponse(result);
  }

  @Roles('property_manager')
  @Put('units/:id')
  async update(@Param('id') id: string, @Body() data: UpdateUnitDto) {
    const unit = await this.service.update(id, data);
    return successResponse(unit);
  }

  // ----- ownership (title chain) -----

  @Roles('property_manager')
  @Post('units/:id/ownerships')
  async setOwner(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @Body() data: SetOwnerDto,
  ) {
    const ownership = await this.service.setOwner(id, orgId, data);
    return successResponse(ownership);
  }

  @Roles('property_manager')
  @Put('units/ownerships/:ownershipId/end')
  async endOwnership(
    @Param('ownershipId') ownershipId: string,
    @CurrentUser('organizationId') orgId: string,
    @Body() body: { endDate?: string },
  ) {
    const ownership = await this.service.endOwnership(ownershipId, orgId, body?.endDate);
    return successResponse(ownership);
  }

  // ----- additional occupants (household members) -----

  @Get('units/:id/additional-occupants')
  async listAdditional(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('role') role: string,
  ) {
    assertStaff(role);
    return successResponse(await this.service.listAdditionalOccupants(id, orgId));
  }

  @Roles('property_manager')
  @Post('units/:id/additional-occupants')
  async addAdditional(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @Body() data: AdditionalOccupantDto,
  ) {
    return successResponse(await this.service.addAdditionalOccupant(id, orgId, data));
  }

  @Roles('property_manager')
  @Put('units/additional-occupants/:occId')
  async updateAdditional(
    @Param('occId') occId: string,
    @CurrentUser('organizationId') orgId: string,
    @Body() data: AdditionalOccupantDto,
  ) {
    return successResponse(await this.service.updateAdditionalOccupant(occId, orgId, data));
  }

  @Roles('property_manager')
  @Delete('units/additional-occupants/:occId')
  async removeAdditional(
    @Param('occId') occId: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return successResponse(await this.service.removeAdditionalOccupant(occId, orgId));
  }
}
