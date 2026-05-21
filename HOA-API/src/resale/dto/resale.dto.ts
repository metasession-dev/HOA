import {
  IsString,
  IsOptional,
  IsEmail,
  IsNumber,
  IsArray,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MaxLength,
  ValidateNested,
  IsObject,
  IsDateString,
  IsNotEmpty,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

export class PartyDto {
  @IsString() @MaxLength(200) fullName: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}

export class AttorneyDto {
  @IsString() @MaxLength(200) firmName: string;
  @IsOptional() @IsString() @MaxLength(200) contactName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) fileReference?: string;
}

export class DisclosureItemDto {
  @IsString() @MaxLength(200) label: string;
  @IsBoolean() present: boolean;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class AttachmentDto {
  @IsString() @MaxLength(2000) url: string;
  @IsString() @MaxLength(255) filename: string;
  @IsString() @IsIn(ALLOWED_DOC_TYPES) contentType: string;
  @IsInt() @Min(0) @Max(50 * 1024 * 1024) size: number;
  @IsOptional() @IsString() @MaxLength(120) label?: string;
}

export class CreateResaleDto {
  @IsString() unitId: string;

  @IsOptional() @ValidateNested() @Type(() => AttorneyDto) transferAttorney?: AttorneyDto;
  @IsOptional() @ValidateNested() @Type(() => PartyDto) buyer?: PartyDto;
  @IsOptional() @ValidateNested() @Type(() => PartyDto) seller?: PartyDto;

  @IsNumber() @Min(0) transferLevyAmount: number;
  @IsOptional() @IsString() @MaxLength(8) transferLevyCurrency?: string;
  @IsOptional() @IsNumber() @Min(0) feeAmount?: number;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DisclosureItemDto)
  disclosureChecklist?: DisclosureItemDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() rushProcessing?: boolean;
}

export class UpdateResaleDto {
  @IsOptional() @ValidateNested() @Type(() => AttorneyDto) transferAttorney?: AttorneyDto;
  @IsOptional() @ValidateNested() @Type(() => PartyDto) buyer?: PartyDto;
  @IsOptional() @ValidateNested() @Type(() => PartyDto) seller?: PartyDto;
  @IsOptional() @IsNumber() @Min(0) transferLevyAmount?: number;
  @IsOptional() @IsString() @MaxLength(8) transferLevyCurrency?: string;
  @IsOptional() @IsNumber() @Min(0) feeAmount?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DisclosureItemDto)
  disclosureChecklist?: DisclosureItemDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() rushProcessing?: boolean;
}

export class CreateAccessLinkDto {
  @IsString() @IsNotEmpty() @MaxLength(200) recipientLabel: string;
  @IsOptional() @IsInt() @Min(1) @Max(60) expiryDays?: number;
}

export class CancelResaleDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}
