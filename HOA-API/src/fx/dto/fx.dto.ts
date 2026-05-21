import { IsString, IsOptional, IsNumber, Min, Max, Matches, IsISO8601, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const CCY = /^[A-Z]{3}$/;

export class UpsertManualRateDto {
  @ApiProperty({ example: 'USD' })
  @IsString()
  @Matches(CCY, { message: 'fromCurrency must be a 3-letter uppercase ISO code' })
  fromCurrency!: string;

  @ApiProperty({ example: 'ZAR' })
  @IsString()
  @Matches(CCY, { message: 'toCurrency must be a 3-letter uppercase ISO code' })
  toCurrency!: string;

  @ApiProperty({ example: 18.45 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0000001)
  @Max(1_000_000)
  rate!: number;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD or full ISO; defaults to today (UTC)' })
  @IsOptional()
  @IsISO8601()
  asOfDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ConvertQueryDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @ApiProperty()
  @IsString()
  @Matches(CCY)
  from!: string;

  @ApiProperty()
  @IsString()
  @Matches(CCY)
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  asOf?: string;
}

export class ListRatesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(CCY)
  fromCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(CCY)
  toCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  since?: string;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @IsString()
  take?: string;
}
