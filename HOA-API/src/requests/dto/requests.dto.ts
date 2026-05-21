import {
  IsString, IsOptional, IsIn, IsInt, Min, Max, IsArray, IsBoolean, IsUrl,
  ArrayMaxSize, MaxLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export class AttachmentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2048)
  url!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  filename!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  contentType!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(25 * 1024 * 1024)
  size!: number;
}

export class CreateRequestCategoryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  defaultPriority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 365)
  slaResolveHours?: number;

  @ApiPropertyOptional({ description: 'Role names whose members are auto-routed when this category is filed.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  assignToRoles?: string[];
}

export class UpdateRequestCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  defaultPriority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 365)
  slaResolveHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  assignToRoles?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateRequestDto {
  @ApiProperty()
  @IsString()
  categoryId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(8000)
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unitId?: string;

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: string;

  @ApiPropertyOptional({ type: [AttachmentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}

export class TransitionRequestDto {
  @ApiProperty()
  @IsString()
  @IsIn(['triaged', 'in_progress', 'waiting_resident', 'resolved', 'closed', 'cancelled'])
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancelledReason?: string;
}

export class AssignRequestDto {
  @ApiPropertyOptional({ description: 'User to assign — pass null to clear assignment.' })
  @IsOptional()
  @IsString()
  assignedToUserId?: string | null;
}

export class ChangePriorityDto {
  @ApiProperty({ enum: PRIORITIES })
  @IsIn(PRIORITIES)
  priority!: string;
}

export class CreateCommentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(8000)
  body!: string;

  @ApiPropertyOptional({ description: 'Admin-only internal note (residents never see).' })
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;

  @ApiPropertyOptional({ type: [AttachmentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}

export class ListRequestsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @ApiPropertyOptional({ enum: PRIORITIES })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: string;

  @ApiPropertyOptional({ description: '"true" to filter to overdue open requests.' })
  @IsOptional()
  @IsString()
  overdue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limit?: string;
}
