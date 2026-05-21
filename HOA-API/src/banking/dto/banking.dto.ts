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
  ValidateNested,
  IsNotEmpty,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBankAccountDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(120) bankName?: string;
  @IsOptional() @IsString() @MaxLength(20) accountNumber?: string;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsString() glAccountId: string;
  @IsOptional() @IsNumber() openingBalance?: number;
}

export class UpdateBankAccountDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(120) bankName?: string;
  @IsOptional() @IsString() @MaxLength(20) accountNumber?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ImportTransactionDto {
  @IsOptional() @IsString() externalId?: string;
  @IsDateString() date: string;
  @IsNumber() amount: number; // positive = inflow, negative = outflow
  @IsString() @MaxLength(500) description: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsOptional() rawPayload?: any;
}

export class ImportTransactionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportTransactionDto)
  transactions: ImportTransactionDto[];

  @IsOptional() @IsIn(['manual', 'csv', 'mono', 'stitch', 'api'])
  source?: 'manual' | 'csv' | 'mono' | 'stitch' | 'api';
}

export class CreateCategorizationRuleDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;

  @IsOptional() @IsIn(['contains', 'starts_with', 'regex', 'equals'])
  matchType?: 'contains' | 'starts_with' | 'regex' | 'equals';

  @IsString() @IsNotEmpty() @MaxLength(500) pattern: string;
  @IsOptional() @IsBoolean() caseInsensitive?: boolean;
  @IsOptional() @IsNumber() amountMin?: number;
  @IsOptional() @IsNumber() amountMax?: number;
  @IsString() glAccountId: string;
  @IsOptional() @IsString() fundId?: string;
  @IsOptional() @IsInt() @Min(0) priority?: number;
}

export class UpdateCategorizationRuleDto extends CreateCategorizationRuleDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class MatchTransactionDto {
  @IsIn(['Payment', 'VendorInvoice', 'JournalEntry', 'Manual'])
  entityType: 'Payment' | 'VendorInvoice' | 'JournalEntry' | 'Manual';

  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsString() glAccountId?: string; // when entityType=Manual, record a JE to this GL
  @IsOptional() @IsString() fundId?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class StartReconciliationDto {
  @IsDateString() periodStart: string;
  @IsDateString() periodEnd: string;
  @IsNumber() statementBalance: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
