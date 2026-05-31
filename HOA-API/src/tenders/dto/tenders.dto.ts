import {
  IsString,
  IsOptional,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  Min,
  Max,
  MaxLength,
  IsDateString,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const ALLOWED_DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export class TenderAttachmentDto {
  @IsString() @MaxLength(2000) url: string;
  @IsString() @MaxLength(255) filename: string;
  @IsString() @IsIn(ALLOWED_DOC_TYPES) contentType: string;
  @IsInt() @Min(0) @Max(50 * 1024 * 1024) size: number;
}

export class CreateTenderDto {
  @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) description: string;
  @IsOptional() @IsString() @MaxLength(20000) scopeOfWork?: string;
  @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsOptional() @IsNumber() @Min(0) budgetMin?: number;
  @IsOptional() @IsNumber() @Min(0) budgetMax?: number;
  // Currency is intentionally omitted — tenders always use the org's settings
  // currency, set server-side.
  @IsDateString() closesAt: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TenderAttachmentDto)
  attachments?: TenderAttachmentDto[];
}

export class UpdateTenderDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(20000) scopeOfWork?: string;
  @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsOptional() @IsNumber() @Min(0) budgetMin?: number;
  @IsOptional() @IsNumber() @Min(0) budgetMax?: number;
  @IsOptional() @IsDateString() closesAt?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TenderAttachmentDto)
  attachments?: TenderAttachmentDto[];
}

/** Ask the assistant to draft a tender Summary or Scope of work. */
export class TenderAiDraftDto {
  @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @IsIn(['summary', 'scope']) field: 'summary' | 'scope';
  @IsOptional() @IsString() @MaxLength(120) category?: string;
  // Optional extra context the admin types (existing notes, constraints, etc.).
  @IsOptional() @IsString() @MaxLength(4000) context?: string;
}

export class SubmitBidDto {
  @IsString() tenderId: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsString() @IsNotEmpty() @MaxLength(10000) proposal: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TenderAttachmentDto)
  attachments?: TenderAttachmentDto[];
}

export class ShortlistBidDto {
  @IsString() bidId: string;
  /** true = shortlist, false = remove from shortlist (back to submitted). */
  @IsOptional() shortlisted?: boolean;
}

export class StartExcoVoteDto {
  @IsOptional() @IsInt() @Min(1) @Max(60) closesInDays?: number;
}

export class AwardBidDto {
  @IsString() bidId: string;
}
