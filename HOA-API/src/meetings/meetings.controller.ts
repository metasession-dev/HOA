import { Body, Controller, Get, Param, Post, Put, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsIn, IsOptional, IsString, MaxLength, IsDateString,
} from 'class-validator';
import type { Response } from 'express';
import { MeetingsService } from './meetings.service';
import { CurrentUser, Roles, Public } from '../common/decorators';
import { successResponse } from '../common/dto';

const AUDIENCES = ['all_residents', 'owners', 'exco', 'everyone'] as const;
// Who can schedule/send meetings — governance + management + comms. hoa_admin /
// super_admin are auto-elevated by the roles guard.
const ORGANISER_ROLES = ['property_manager', 'communications_manager', 'exco_member', 'exco_chairperson'];

class CreateMeetingDto {
  @IsString() @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsString() @MaxLength(1000) onlineUrl?: string;
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @IsOptional() @IsIn(AUDIENCES) audience?: (typeof AUDIENCES)[number];
}

class UpdateMeetingDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsString() @MaxLength(1000) onlineUrl?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsIn(AUDIENCES) audience?: (typeof AUDIENCES)[number];
}

@ApiTags('Meetings')
@Controller('meetings')
export class MeetingsController {
  constructor(private service: MeetingsService) {}

  // Public calendar file — referenced by the email's "Add to calendar" link.
  // No auth: the id is the capability (same posture as a calendar feed URL).
  @Public()
  @Get(':id/ics')
  async ics(@Param('id') id: string, @Res() res: Response) {
    const { filename, content } = await this.service.buildIcs(id);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  @ApiBearerAuth()
  @Roles(...ORGANISER_ROLES)
  @Get()
  async list(@CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.service.list(orgId));
  }

  @ApiBearerAuth()
  @Roles(...ORGANISER_ROLES)
  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.service.get(id, orgId));
  }

  @ApiBearerAuth()
  @Roles(...ORGANISER_ROLES)
  @Post()
  async create(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateMeetingDto,
  ) {
    return successResponse(await this.service.create(orgId, { userId }, dto));
  }

  @ApiBearerAuth()
  @Roles(...ORGANISER_ROLES)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @Body() dto: UpdateMeetingDto,
  ) {
    return successResponse(await this.service.update(id, orgId, dto));
  }

  @ApiBearerAuth()
  @Roles(...ORGANISER_ROLES)
  @Post(':id/send')
  async send(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.service.send(id, orgId, { userId, role }));
  }

  @ApiBearerAuth()
  @Roles(...ORGANISER_ROLES)
  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @CurrentUser('organizationId') orgId: string) {
    return successResponse(await this.service.cancel(id, orgId));
  }
}
