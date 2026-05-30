import {
  IsString,
  IsOptional,
  IsEmail,
  IsIn,
  IsArray,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsBoolean,
  IsNumber,
  ValidateNested,
  IsObject,
  IsDateString,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

export class VendorDocumentDto {
  @IsString()
  @MaxLength(2000)
  url: string;

  @IsString()
  @MaxLength(255)
  filename: string;

  @IsString()
  @IsIn(ALLOWED_DOC_TYPES)
  contentType: string;

  @IsInt()
  @Min(0)
  @Max(50 * 1024 * 1024)
  size: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class CreateVendorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(60) taxNumber?: string;
  @IsOptional() @IsString() @MaxLength(60) registrationNo?: string;
  @IsOptional() @IsString() @MaxLength(120) bankAccountName?: string;
  @IsOptional() @IsString() @MaxLength(120) bankName?: string;
  @IsOptional() @IsString() @MaxLength(40) bankAccountNo?: string;
  @IsOptional() @IsString() @MaxLength(40) bankBranchCode?: string;

  @IsOptional() @IsString() @MaxLength(8) preferredCurrency?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => VendorDocumentDto)
  documents?: VendorDocumentDto[];

  @IsOptional() @IsString() defaultGlAccountId?: string;

  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateVendorDto extends CreateVendorDto {}

export class ChangeVendorStatusDto {
  @IsIn(['active', 'suspended', 'blacklisted'])
  status: 'active' | 'suspended' | 'blacklisted';

  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class LineItemDto {
  @IsString() @MaxLength(500) description: string;

  @IsNumber() @Min(0) quantity: number;

  @IsNumber() @Min(0) unitPrice: number;

  @IsNumber() @Min(0) total: number;

  @IsOptional() @IsString() glAccountId?: string;
}

export class InvoiceAttachmentDto {
  @IsString() @MaxLength(2000) url: string;
  @IsString() @MaxLength(255) filename: string;
  @IsString() @IsIn(ALLOWED_DOC_TYPES) contentType: string;
  @IsInt() @Min(0) @Max(50 * 1024 * 1024) size: number;
}

export class CreateVendorInvoiceDto {
  @IsString() vendorId: string;

  // Vendor's own invoice number, useful for reconciliation against the
  // supplier's books. OPTIONAL — when omitted, the server auto-generates an
  // internal reference like `VINV-2026-00042` so the user never has to type
  // one. They can still add the supplier's number later via UPDATE.
  @IsOptional() @IsString() @MaxLength(80) vendorInvoiceNo?: string;

  @IsNumber() @Min(0.01) amount: number;

  @IsOptional() @IsString() @MaxLength(8) currency?: string;

  @IsOptional() @IsNumber() @Min(0) vatAmount?: number;

  @IsDateString() issueDate: string;
  @IsDateString() dueDate: string;

  @IsOptional() @IsString() glAccountId?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => LineItemDto)
  lineItems?: LineItemDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceAttachmentDto)
  attachments?: InvoiceAttachmentDto[];

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;

  @IsOptional() @IsBoolean() overrideDuplicate?: boolean;
  @IsOptional() @IsBoolean() currencyOverride?: boolean;
}

/**
 * Vendor-portal self-submission. Same shape as CreateVendorInvoiceDto but the
 * vendorId is resolved server-side from the logged-in vendor, and vendors can't
 * pick a GL account or override duplicate detection.
 */
export class SubmitVendorInvoiceDto {
  @IsOptional() @IsString() @MaxLength(80) vendorInvoiceNo?: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsOptional() @IsNumber() @Min(0) vatAmount?: number;
  @IsDateString() issueDate: string;
  @IsDateString() dueDate: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => LineItemDto)
  lineItems?: LineItemDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceAttachmentDto)
  attachments?: InvoiceAttachmentDto[];

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() currencyOverride?: boolean;
}

export class UpdateVendorInvoiceDto {
  @IsOptional() @IsString() @MaxLength(80) vendorInvoiceNo?: string;
  @IsOptional() @IsNumber() @Min(0.01) amount?: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsOptional() @IsNumber() @Min(0) vatAmount?: number;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() glAccountId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => LineItemDto)
  lineItems?: LineItemDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceAttachmentDto)
  attachments?: InvoiceAttachmentDto[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class DecideApprovalDto {
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class RejectInvoiceDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) reason: string;
}

export class PayInvoiceDto {
  @IsString() @IsNotEmpty() @MaxLength(120) paymentReference: string;
  @IsOptional() @IsDateString() paidAt?: string;
}

export class BatchPayDto {
  @IsArray()
  @IsString({ each: true })
  invoiceIds: string[];

  @IsString() @IsNotEmpty() @MaxLength(120) paymentReferencePrefix: string;
}

export class CreateApprovalRuleDto {
  @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @IsOptional() @IsNumber() @Min(0) minAmount?: number;
  @IsOptional() @IsNumber() @Min(0) maxAmount?: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  glAccountIds?: string[];

  @IsArray() @IsString({ each: true })
  requiredRoles: string[];

  @IsOptional() @IsInt() @Min(1) @Max(10) approverCount?: number;

  @IsOptional() @IsIn(['any', 'all', 'sequential'])
  mode?: 'any' | 'all' | 'sequential';

  @IsOptional() @IsInt() @Min(0) priority?: number;

  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateApprovalRuleDto extends CreateApprovalRuleDto {}
