import { IsString, IsOptional } from 'class-validator';

export class LogEntryDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  overrideReason?: string;
}

export class VerifyCodeDto {
  @IsString()
  code!: string;
}

export class DenyEntryDto {
  @IsString()
  reason!: string;
}
