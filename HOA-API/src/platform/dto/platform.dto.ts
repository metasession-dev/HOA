import {
  IsString, IsOptional, IsArray, IsInt, Min, Max, IsBoolean, IsUrl, MaxLength,
  IsISO8601, ArrayMaxSize, ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'CI key for accounting integration' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: ['invoices.read', 'payments.read'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @IsString({ each: true })
  permissions!: string[];

  @ApiPropertyOptional({ description: 'Override default rate-limit (req/min).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  rateLimitPerMin?: number;

  @ApiPropertyOptional({ description: 'ISO timestamp when this key auto-expires.' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

export class RevokeApiKeyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateWebhookEndpointDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'https://example.com/webhooks/hoa' })
  @IsString()
  @MaxLength(2048)
  url!: string;

  @ApiProperty({ example: ['payment.received', 'gate_pass.created'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  events!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateWebhookEndpointDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  events?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
