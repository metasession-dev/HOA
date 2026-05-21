import {
  IsString, IsOptional, IsIn, IsBoolean, Matches, MaxLength, IsUUID, IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestExportDto {
  @ApiPropertyOptional({ description: 'Admin-only: target user (defaults to caller).' })
  @IsOptional()
  @IsString()
  targetUserId?: string;

  @ApiPropertyOptional({ description: 'Scope export to a single organization.' })
  @IsOptional()
  @IsString()
  organizationId?: string;
}

export class SubmitErasureDto {
  @ApiPropertyOptional({ description: 'Admin-only: target user (defaults to caller).' })
  @IsOptional()
  @IsString()
  targetUserId?: string;

  @ApiPropertyOptional({ description: 'Scope erasure to a single organization. Omit for global.' })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ModerateErasureDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @ApiPropertyOptional({ description: 'Required when decision = rejected.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class RecordConsentDto {
  @ApiProperty({ example: 'marketing_email' })
  @IsString()
  @Matches(/^[a-z0-9_]+$/i, { message: 'consentType must match /^[a-z0-9_]+$/i' })
  @MaxLength(60)
  consentType!: string;

  @ApiProperty({ enum: ['given', 'withdrawn'] })
  @IsIn(['given', 'withdrawn'])
  state!: 'given' | 'withdrawn';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: 'Version of the policy the user consented to.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  policyVersion?: string;
}
