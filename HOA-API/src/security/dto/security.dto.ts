import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEmail, MaxLength, MinLength, IsArray, IsIn } from 'class-validator';

export class StartMfaEnrollmentDto {}

export class VerifyMfaEnrollmentDto {
  @IsString() @IsNotEmpty() @MaxLength(10) code: string;
}

export class DisableMfaDto {
  @IsString() @MinLength(8) @MaxLength(255) password: string;
  // Phase 6 review #6: disabling MFA requires the second factor as well, so
  // a phished password alone can't remove the protection it bypassed.
  @IsString() @IsNotEmpty() @MaxLength(64) mfaCode: string;
}

export class VerifyMfaLoginDto {
  @IsString() @IsNotEmpty() mfaChallengeToken: string;
  @IsString() @IsNotEmpty() @MaxLength(64) code: string;
  @IsOptional() @IsBoolean() trustDevice?: boolean;
  @IsOptional() @IsString() @MaxLength(80) deviceLabel?: string;
}

export class RefreshTokenDto {
  @IsString() @IsNotEmpty() refreshToken: string;
}

export class RequestMagicLinkDto {
  @IsEmail() @MaxLength(255) email: string;
}

export class RedeemMagicLinkDto {
  @IsString() @IsNotEmpty() token: string;
  @IsOptional() @IsBoolean() trustDevice?: boolean;
  @IsOptional() @IsString() @MaxLength(80) deviceLabel?: string;
}

export class RevokeSessionDto {
  @IsOptional() @IsString() reason?: string;
}

export class UpdateSecurityPolicyDto {
  @IsOptional() @IsArray() @IsString({ each: true })
  mfaRequiredRoles?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  ipAllowlist?: string[];
}
