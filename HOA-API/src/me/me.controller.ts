import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators';
import { successResponse } from '../common/dto';
import { MeService } from './me.service';

class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  firstName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  lastName?: string;
  @IsOptional() @IsString() @MaxLength(40)
  phone?: string;
  @IsOptional() @IsString() @MaxLength(500)
  avatarUrl?: string;
  @IsOptional() @IsIn(['en', 'fr', 'pt', 'sw', 'af', 'zu'])
  language?: string;
}

class ChangePasswordDto {
  @IsString() @MinLength(8) @MaxLength(200)
  currentPassword: string;
  @IsString() @MinLength(8) @MaxLength(200)
  newPassword: string;
}

class SinglePrefDto {
  @IsString()
  topic!: string;
  @IsOptional() @IsBoolean() email?: boolean;
  @IsOptional() @IsBoolean() sms?: boolean;
  @IsOptional() @IsBoolean() push?: boolean;
  @IsOptional() @IsBoolean() whatsapp?: boolean;
}

class BulkPrefsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SinglePrefDto)
  rows!: SinglePrefDto[];
}

class AddOccupantDto {
  @IsString()
  unitId!: string;
  @IsIn(['tenant', 'dependent', 'caretaker'])
  role!: 'tenant' | 'dependent' | 'caretaker';
  @IsString() @MinLength(1) @MaxLength(120)
  firstName!: string;
  @IsString() @MinLength(1) @MaxLength(120)
  lastName!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() startDate?: string;
}

class UpdateOccupantDto {
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}

@ApiTags('Me')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly service: MeService) {}

  @Get('profile')
  async getProfile(@CurrentUser('sub') userId: string) {
    return successResponse(await this.service.getProfile(userId));
  }

  @Put('profile')
  async updateProfile(@CurrentUser('sub') userId: string, @Body() dto: UpdateProfileDto) {
    return successResponse(await this.service.updateProfile(userId, dto));
  }

  /**
   * Change the signed-in user's password. Requires the current password.
   * Bumps sessionVersion so other live sessions for this user get
   * invalidated on their next request.
   */
  @Post('password')
  async changePassword(@CurrentUser('sub') userId: string, @Body() dto: ChangePasswordDto) {
    return successResponse(await this.service.changePassword(userId, dto));
  }

  @Get('notification-preferences')
  async listPrefs(@CurrentUser('sub') userId: string) {
    return successResponse(await this.service.listPreferences(userId));
  }

  @Put('notification-preferences/:topic')
  async setPref(
    @CurrentUser('sub') userId: string,
    @Param('topic') topic: string,
    @Body() body: { email?: boolean; sms?: boolean; push?: boolean; whatsapp?: boolean },
  ) {
    return successResponse(await this.service.setPreference(userId, topic, body));
  }

  @Put('notification-preferences')
  async setAllPrefs(@CurrentUser('sub') userId: string, @Body() dto: BulkPrefsDto) {
    return successResponse(await this.service.setAllPreferences(userId, dto.rows));
  }

  @Get('occupants')
  async listOccupants(
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return successResponse(await this.service.listOccupants(userId, organizationId));
  }

  /**
   * Units the current resident is actively occupying (owner OR tenant).
   * Used by forms that should auto-fill the unit instead of asking the
   * resident to pick from estates they don't manage.
   */
  @Get('units')
  async listMyUnits(
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return successResponse(await this.service.myUnits(userId, organizationId));
  }

  @Post('occupants')
  async addOccupant(
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: AddOccupantDto,
  ) {
    return successResponse(await this.service.addOccupant(userId, organizationId, dto));
  }

  @Put('occupants/:id')
  async updateOccupant(
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOccupantDto,
  ) {
    return successResponse(await this.service.updateOccupant(userId, organizationId, id, dto));
  }

  @Delete('occupants/:id')
  async endOccupant(
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
    @Param('id') id: string,
    @Query('endDate') endDate?: string,
  ) {
    return successResponse(await this.service.endOccupant(userId, organizationId, id, endDate));
  }
}
