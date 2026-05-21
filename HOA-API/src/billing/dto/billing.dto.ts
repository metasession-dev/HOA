import {
  IsString, IsOptional, IsIn, IsInt, Min, Max, IsArray, IsBoolean, IsNumber,
  ArrayMaxSize, ArrayMinSize, MaxLength, ValidateNested, IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============ Recurring schedules ============

const FREQUENCIES = ['monthly', 'quarterly', 'annual'];

export class LineItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  description!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;
}

export class UnitFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  estateIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIn?: string[];
}

export class CreateRecurringScheduleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: FREQUENCIES })
  @IsIn(FREQUENCIES)
  frequency!: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  billingDayOfMonth?: number;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  dueDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ default: 'ZAR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ type: [LineItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems?: LineItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ type: UnitFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UnitFilterDto)
  unitFilter?: UnitFilterDto;
}

export class UpdateRecurringScheduleDto extends CreateRecurringScheduleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ============ Late fees ============

export class LateFeeTierDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  ageDays!: number;

  @ApiProperty({ enum: ['percent', 'flat'] })
  @IsIn(['percent', 'flat'])
  kind!: 'percent' | 'flat';

  @ApiProperty()
  @IsNumber()
  @Min(0)
  value!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  cap?: number;
}

export class UpsertLateFeeConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  graceDays?: number;

  @ApiPropertyOptional({ type: [LateFeeTierDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => LateFeeTierDto)
  tiers?: LateFeeTierDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  glAccountId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

// ============ Payment plans ============

export class CreatePaymentPlanDto {
  @ApiProperty()
  @IsString()
  unitId!: string;

  @ApiProperty()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  sourceInvoiceIds!: string[];

  @ApiProperty()
  @IsInt()
  @Min(2)
  @Max(36)
  installmentCount!: number;

  @ApiPropertyOptional({ enum: ['weekly', 'biweekly', 'monthly'], default: 'monthly' })
  @IsOptional()
  @IsIn(['weekly', 'biweekly', 'monthly'])
  cadence?: string;

  @ApiProperty()
  @IsISO8601()
  startDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CancelPaymentPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
