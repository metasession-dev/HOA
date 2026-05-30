import {
  IsString,
  IsOptional,
  IsEmail,
  IsArray,
  IsIn,
  IsBoolean,
  IsNumber,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsDateString,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// All valid system role names. CustomRole IDs go through customRoleId.
export const SYSTEM_ROLE_NAMES = [
  'super_admin', 'hoa_admin', 'property_manager', 'finance_officer',
  'exco_member', 'exco_chairperson', 'communications_manager',
  'gate_security', 'maintenance_coordinator', 'external_accountant',
  'owner', 'tenant', 'vendor',
] as const;

// Invite kinds — pick one and the UI branches accordingly:
//   'team_member' = staff who'll log into the admin console (any non-resident
//                   role + optional custom role + estate/unit scope)
//   'resident'    = owner/tenant who'll log into the resident PWA. When a
//                   personId is given, the invite is bound to that Person so
//                   redemption can link the new User without creating a
//                   duplicate Person row.
//   'vendor'      = external supplier getting a self-service portal login in the
//                   resident PWA, linked to a Vendor record via vendorId.
export const INVITE_KINDS = ['team_member', 'resident', 'vendor'] as const;
export type InviteKind = typeof INVITE_KINDS[number];

export class CreateInviteDto {
  @IsEmail() @MaxLength(255) email: string;
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;

  @IsOptional() @IsIn(SYSTEM_ROLE_NAMES) roleName?: typeof SYSTEM_ROLE_NAMES[number];
  @IsOptional() @IsString() customRoleId?: string;

  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) unitIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) estateIds?: string[];
  @IsOptional() @IsNumber() @Min(0) approvalLimit?: number;

  /** What kind of invite this is. Defaults to 'team_member' for back-compat. */
  @IsOptional() @IsIn(INVITE_KINDS) kind?: InviteKind;
  /** When kind = 'resident', the existing Person to bind the invite to. */
  @IsOptional() @IsString() personId?: string;
  /** When kind = 'vendor', the Vendor record to link the new login to. */
  @IsOptional() @IsString() vendorId?: string;

  /**
   * Whether the redeemed user should be granted access to the admin
   * console. Optional — when omitted, the redeem path derives a sensible
   * default from `kind` (team_member → true, resident → false). Explicit
   * `true` on a resident invite is supported (occasional case: a resident
   * who also helps run the HOA's exco).
   */
  @IsOptional() @IsBoolean() enterpriseAccess?: boolean;
}

// Bulk rows are intentionally loose: the BulkInviteService validates each row
// itself and returns a per-row outcome so one bad row doesn't take down the batch.
export class BulkInviteRowDto {
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() roleName?: string;
  @IsOptional() @IsString() customRoleId?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) unitIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) estateIds?: string[];
  @IsOptional() @IsNumber() approvalLimit?: number;
}

export class BulkInviteDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkInviteRowDto)
  invites: BulkInviteRowDto[];
}

export class RedeemInviteDto {
  @IsString() @IsNotEmpty() token: string;
  @IsString() @IsNotEmpty() @MaxLength(255) password: string;
  @IsString() @MaxLength(100) firstName: string;
  @IsString() @MaxLength(100) lastName: string;
}

export class UpdateUserRoleDto {
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) unitIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) estateIds?: string[];
  @IsOptional() @IsNumber() @Min(0) approvalLimit?: number;
}

export class AssignRoleDto {
  @IsString() userId: string;
  @IsOptional() @IsIn(SYSTEM_ROLE_NAMES) roleName?: typeof SYSTEM_ROLE_NAMES[number];
  @IsOptional() @IsString() customRoleId?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) unitIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) estateIds?: string[];
  @IsOptional() @IsNumber() @Min(0) approvalLimit?: number;
}

export class CreateCustomRoleDto {
  @IsString() @IsNotEmpty() @MaxLength(60) name: string;
  @IsString() @IsNotEmpty() @MaxLength(120) displayName: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsArray() @IsString({ each: true }) permissions: string[];
  @IsOptional() @IsNumber() @Min(0) defaultApprovalLimit?: number;
}

export class UpdateCustomRoleDto {
  @IsOptional() @IsString() @MaxLength(120) displayName?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
  @IsOptional() @IsNumber() @Min(0) defaultApprovalLimit?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
