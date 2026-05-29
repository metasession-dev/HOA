import {
  IsString,
  IsOptional,
  IsArray,
  IsDateString,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export class PhotoMetadataDto {
  @IsString()
  @MaxLength(2048)
  url!: string;

  @IsString()
  @MaxLength(256)
  filename!: string;

  @IsString()
  contentType!: string;

  @IsOptional()
  size?: number;

  // The uploader (FileUpload) includes the StoredFile id so we can clean up
  // the blob later. Allowed (optional) so whitelist validation doesn't reject it.
  @IsOptional()
  @IsString()
  storedFileId?: string;
}

export class CreateViolationDto {
  @IsString()
  unitId!: string;

  @IsString()
  categoryId!: string;

  @IsDateString()
  occurredAt!: string;

  @IsString()
  @MaxLength(4000)
  description!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PhotoMetadataDto)
  photos?: PhotoMetadataDto[];
}

export class CreateCategoryDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  defaultFine?: number;

  @IsOptional()
  @IsString()
  fineCurrency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  noticeTemplate?: string;

  @IsOptional()
  graceDays?: number;
}

export class IssueNoticeDto {
  @IsOptional()
  forceResend?: boolean;
}

export class IssueFineDto {
  @IsOptional()
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class ResolveViolationDto {
  @IsString()
  @MaxLength(2000)
  notes!: string;

  @IsOptional()
  @IsString()
  outcome?: 'closed' | 'upheld' | 'dismissed';
}

export class CreateAppealDto {
  @IsString()
  @MaxLength(4000)
  reason!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  evidence?: PhotoMetadataDto[];
}

export class DecideAppealDto {
  @IsString()
  decision!: 'upheld' | 'dismissed';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export { ALLOWED_CONTENT_TYPES };
