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
  Allow,
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

export class SurveyOptionDto {
  @IsString()
  @MaxLength(60)
  id!: string;

  @IsString()
  @MaxLength(200)
  label!: string;
}

export class SurveyQuestionDto {
  @IsString()
  @MaxLength(40)
  id!: string;

  @IsIn(['mc', 'rating', 'text'])
  type!: 'mc' | 'rating' | 'text';

  @IsString()
  @MaxLength(500)
  label!: string;

  // MUST use @ValidateNested + @Type — otherwise ValidationPipe(whitelist:true)
  // strips the nested {id,label} on every survey create (options become empty).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SurveyOptionDto)
  options?: SurveyOptionDto[];

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

export class SurveyAnswerDto {
  @IsString()
  @MaxLength(40)
  questionId!: string;

  // value may be string | number | string[]; @Allow keeps it through the
  // whitelist without constraining the type.
  @Allow()
  value!: string | number | string[];
}

export class SubmitSurveyResponseDto {
  // @ValidateNested + @Type required, else whitelist strips each answer's
  // {questionId,value} to an empty object (responses recorded but unscorable).
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SurveyAnswerDto)
  answers!: SurveyAnswerDto[];
}

export class GenerateSurveyDto {
  @IsString()
  @MaxLength(1000)
  prompt!: string;

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(15)
  questionCount?: number;
}
