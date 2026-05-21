import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const PLAN_CODES = ['starter', 'growth', 'pro', 'enterprise'] as const;

export class SubscribeDto {
  @ApiProperty({ enum: PLAN_CODES })
  @IsIn(PLAN_CODES as unknown as string[])
  planCode!: (typeof PLAN_CODES)[number];

  @ApiProperty({ description: 'Billing email — receives Paystack receipts.' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Where Paystack redirects after hosted checkout.' })
  @IsString()
  @MinLength(8)
  callbackUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

export class ChangePlanDto {
  @ApiProperty({ enum: PLAN_CODES })
  @IsIn(PLAN_CODES as unknown as string[])
  planCode!: (typeof PLAN_CODES)[number];
}

export class CancelSubscriptionDto {
  @ApiProperty({ description: 'Required cancellation reason for audit.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
