import {
  IsString,
  IsOptional,
  IsIn,
  IsBoolean,
  IsArray,
  IsObject,
  IsInt,
  Min,
  Max,
  IsDateString,
  ValidateNested,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VoteOptionDto {
  @IsString()
  @MaxLength(40)
  id!: string;

  @IsString()
  @MaxLength(200)
  label!: string;
}

export class CreateVoteDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(4000)
  description!: string;

  @IsOptional()
  @IsIn(['standard', 'special_resolution', 'agm'])
  type?: 'standard' | 'special_resolution' | 'agm';

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => VoteOptionDto)
  options!: VoteOptionDto[];

  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @IsOptional()
  @IsIn(['all_owners', 'paid_up_only', 'all_residents', 'tag_match'])
  eligibilityRule?: 'all_owners' | 'paid_up_only' | 'all_residents' | 'tag_match';

  @IsOptional()
  @IsObject()
  eligibilityFilter?: { maxOverdue?: number; tagSlug?: string };

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quorumPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  passThresholdPercent?: number;

  @IsOptional()
  @IsBoolean()
  proxyAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  resultsLiveVisible?: boolean;

  @IsDateString()
  opensAt!: string;

  @IsDateString()
  closesAt!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  noticePeriodDays?: number;
}

export class CastBallotDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  selectedOptionIds!: string[];

  /** When using a proxy (acting on behalf of grantorPersonId). */
  @IsOptional()
  @IsString()
  asProxyForPersonId?: string;
}

export class GrantProxyDto {
  @IsString()
  granteeUserId!: string;
}

// ============ Surveys ============

export class SurveyQuestionDto {
  @IsString()
  @MaxLength(40)
  id!: string;

  @IsIn(['mc', 'rating', 'text'])
  type!: 'mc' | 'rating' | 'text';

  @IsString()
  @MaxLength(500)
  label!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  options?: { id: string; label: string }[];

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(10)
  ratingMax?: number;
}

export class CreateSurveyDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(4000)
  description!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SurveyQuestionDto)
  questions!: SurveyQuestionDto[];

  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @IsOptional()
  @IsDateString()
  opensAt?: string;

  @IsOptional()
  @IsDateString()
  closesAt?: string;
}

export class SubmitSurveyResponseDto {
  @IsArray()
  answers!: { questionId: string; value: string | number | string[] }[];
}
