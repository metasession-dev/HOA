import { IsString, IsOptional, MaxLength, IsNotEmpty, IsIn } from 'class-validator';

export class SendMessageDto {
  @IsOptional() @IsString() conversationId?: string;
  @IsString() @IsNotEmpty() @MaxLength(4000) text: string;
}

export class CreateConversationDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
}

export class DismissAnomalyDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ListAnomaliesQueryDto {
  @IsOptional() @IsIn(['info', 'warning', 'critical']) severity?: 'info' | 'warning' | 'critical';
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsIn(['open', 'acknowledged', 'dismissed', 'all']) status?: 'open' | 'acknowledged' | 'dismissed' | 'all';
}
