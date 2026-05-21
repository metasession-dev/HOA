import { IsIn, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const TIERS = ['basic', 'standard', 'premium'] as const;

export class RequestEngagementDto {
  @ApiProperty({ enum: TIERS, example: 'standard' })
  @IsIn(TIERS as unknown as string[])
  tier!: (typeof TIERS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ChangeTierDto {
  @ApiProperty({ enum: TIERS })
  @IsIn(TIERS as unknown as string[])
  tier!: (typeof TIERS)[number];
}

export class AssignAccountantDto {
  @ApiProperty({ description: 'userId of a User holding the external_accountant role.' })
  @IsString()
  @MinLength(1)
  accountantUserId!: string;
}

export class CancelEngagementDto {
  @ApiProperty({ description: 'Required cancellation reason for audit.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class AddNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note!: string;
}
