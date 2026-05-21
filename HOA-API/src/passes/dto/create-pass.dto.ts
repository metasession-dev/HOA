import {
  IsString,
  IsOptional,
  IsIn,
  IsInt,
  Min,
  IsDateString,
  IsArray,
  IsObject,
} from 'class-validator';

export const PASS_TYPES = [
  'single_visit',
  'recurring',
  'event',
  'contractor',
  'delivery',
  'emergency',
] as const;
export type PassType = (typeof PASS_TYPES)[number];

export class CreatePassDto {
  @IsString()
  unitId!: string;

  @IsIn(PASS_TYPES as unknown as string[])
  type!: PassType;

  @IsString()
  visitorName!: string;

  @IsOptional()
  @IsString()
  visitorPhone?: string;

  @IsOptional()
  @IsString()
  vehicleReg?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsDateString()
  validFrom!: string;

  @IsDateString()
  validUntil!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsArray()
  recurringDays?: string[];

  @IsOptional()
  @IsObject()
  recurringWindow?: { start: string; end: string };
}
