import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsInt,
  IsIn,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFundDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;

  @IsIn(['operating', 'reserve', 'sinking', 'special_levy'])
  type: 'operating' | 'reserve' | 'sinking' | 'special_levy';

  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsNumber() openingBalance?: number;
}

export class UpdateFundDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsNumber() openingBalance?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class BudgetLineDto {
  @IsString() @IsNotEmpty() glAccountId: string;

  @IsArray()
  @ArrayMinSize(12)
  @ArrayMaxSize(12)
  @IsNumber({}, { each: true })
  amounts: number[];

  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreateBudgetDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name: string;

  @IsInt() @Min(2020) @Max(2100) fiscalYear: number;

  @IsOptional() @IsString() fundId?: string;

  @IsOptional() @IsString() @MaxLength(8) currency?: string;

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BudgetLineDto)
  lines: BudgetLineDto[];
}

export class UpdateBudgetDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BudgetLineDto)
  lines?: BudgetLineDto[];
}

export class BudgetTransitionDto {
  @IsIn(['active', 'closed'])
  target: 'active' | 'closed';
}
