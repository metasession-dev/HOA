import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PeopleService } from './people.service';
import { CurrentUser, Roles } from '../common/decorators';
import { PaginationDto, successResponse } from '../common/dto';

const PERSON_TYPES = ['owner', 'tenant', 'stakeholder'] as const;
const OCCUPANCY_ROLES = ['owner', 'tenant'] as const;

class CreatePersonDto {
  @IsString() @MaxLength(120) firstName: string;
  @IsString() @MaxLength(120) lastName: string;
  @IsOptional() @IsEmail() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsIn(PERSON_TYPES) type?: (typeof PERSON_TYPES)[number];
  @IsOptional() @IsString() @MaxLength(1000) photoUrl?: string;
}

class UpdatePersonDto {
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsEmail() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsIn(PERSON_TYPES) type?: (typeof PERSON_TYPES)[number];
  @IsOptional() @IsString() @MaxLength(1000) photoUrl?: string;
}

class AssignToUnitDto {
  @IsString() unitId: string;
  @IsIn(OCCUPANCY_ROLES) role: (typeof OCCUPANCY_ROLES)[number];
  @IsDateString() startDate: string;
  @IsOptional() @IsBoolean() isPrimaryContact?: boolean;
  @IsOptional() @IsInt() @Min(1) householdSize?: number;
}

@ApiTags('People')
@ApiBearerAuth()
@Roles('property_manager')
@Controller('people')
export class PeopleController {
  constructor(private service: PeopleService) {}

  @Get()
  async findAll(@CurrentUser('organizationId') orgId: string, @Query() query: PaginationDto) {
    return this.service.findAll(orgId, query);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    const person = await this.service.findById(id, orgId);
    return successResponse(person);
  }

  @Post()
  async create(@CurrentUser('organizationId') orgId: string, @Body() data: CreatePersonDto) {
    const person = await this.service.create(orgId, data);
    return successResponse(person);
  }

  @Put(':id')
  async update(@Param('id') id: string, @CurrentUser('organizationId') orgId: string, @Body() data: UpdatePersonDto) {
    const person = await this.service.update(id, orgId, data);
    return successResponse(person);
  }

  @Get(':id/activity')
  async activity(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    const activity = await this.service.getActivity(id, orgId);
    return successResponse(activity);
  }

  @Post(':id/occupancies')
  async assignToUnit(@Param('id') id: string, @Body() data: AssignToUnitDto) {
    const occupancy = await this.service.assignToUnit(id, data);
    return successResponse(occupancy);
  }

  @Put('occupancies/:occupancyId/deactivate')
  async removeFromUnit(@Param('occupancyId') occupancyId: string) {
    const occupancy = await this.service.removeFromUnit(occupancyId);
    return successResponse(occupancy);
  }
}
