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

// ============ Billing catalog (Phase 1 of unit-default-billing) ============

// `baseTerm` is the PRICING unit, not a cron cadence (see SPEC §4). daily/weekly
// are valid pricing units but are prepay-only as schedules in v1.
export const BILLING_TERMS = ['daily', 'weekly', 'monthly', 'quarterly', 'biannual', 'annual'];
export const PRORATION_MODES = ['whole_period', 'calendar_day', 'thirty_day'];
export const ROUNDING_MODES = ['half_up', 'bankers'];

export class CreateBillingTypeDto {
  // Stable slug, immutable after create. Optional on create — derived from `name`
  // when omitted (the service slugifies + de-dupes).
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  key?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  defaultAmount!: number;

  @ApiProperty({ enum: BILLING_TERMS })
  @IsIn(BILLING_TERMS)
  baseTerm!: string;

  @ApiPropertyOptional({ description: 'null/omitted = inherit org currency' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string | null;

  @ApiPropertyOptional({ enum: PRORATION_MODES, default: 'whole_period' })
  @IsOptional()
  @IsIn(PRORATION_MODES)
  prorationMode?: string;

  @ApiPropertyOptional({ enum: ROUNDING_MODES, default: 'half_up' })
  @IsOptional()
  @IsIn(ROUNDING_MODES)
  roundingMode?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minChargeMinor?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allowResidentPrepay?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  attachByDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  glAccountId?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

// `key` is intentionally omitted — it is immutable after create.
export class UpdateBillingTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultAmount?: number;

  @ApiPropertyOptional({ enum: BILLING_TERMS })
  @IsOptional()
  @IsIn(BILLING_TERMS)
  baseTerm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string | null;

  @ApiPropertyOptional({ enum: PRORATION_MODES })
  @IsOptional()
  @IsIn(PRORATION_MODES)
  prorationMode?: string;

  @ApiPropertyOptional({ enum: ROUNDING_MODES })
  @IsOptional()
  @IsIn(ROUNDING_MODES)
  roundingMode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minChargeMinor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowResidentPrepay?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  attachByDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  glAccountId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ============ Per-unit billing attachments (Phase 2) ============

export class AttachUnitBillingDto {
  @ApiProperty()
  @IsString()
  billingTypeId!: string;

  // Optional snapshot override; defaults to the catalog defaultAmount.
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;
}

export class UpdateUnitBillingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;
}

// Either `unitIds` (explicit) or `estateIds` (all units in those estates); both
// omitted = every unit in the org.
export class BillingActivationTargetDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  unitIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  estateIds?: string[];
}

export class BulkActivateBillingDto {
  @ApiPropertyOptional({ type: BillingActivationTargetDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BillingActivationTargetDto)
  target?: BillingActivationTargetDto;

  @ApiProperty()
  @IsBoolean()
  active!: boolean;

  // When activating, also attach the type to units that don't have it yet.
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  attachIfMissing?: boolean;
}
