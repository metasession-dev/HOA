import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AssistantService } from './assistant.service';
import { AnomalyService } from './anomaly.service';
import { CurrentUser, Roles } from '../common/decorators';
import { successResponse } from '../common/dto';
import { Idempotent, IdempotencyInterceptor } from '../common/idempotency';
import {
  SendMessageDto,
  CreateConversationDto,
  DismissAnomalyDto,
  ListAnomaliesQueryDto,
} from './dto/assistant.dto';

const ALL_INSIDERS = [
  'hoa_admin', 'super_admin', 'property_manager',
  'finance_officer', 'external_accountant',
  'exco_member', 'exco_chairperson', 'communications_manager',
  'gate_security', 'maintenance_coordinator',
  'owner', 'tenant',
] as const;
const ADMIN_BOARD_FINANCE = ['hoa_admin', 'super_admin', 'finance_officer', 'external_accountant', 'exco_member', 'exco_chairperson'] as const;

@ApiTags('Assistant')
@ApiBearerAuth()
@Controller('assistant')
@UseInterceptors(IdempotencyInterceptor)
export class AssistantController {
  constructor(private assistant: AssistantService) {}

  @Get('conversations')
  @Roles(...ALL_INSIDERS)
  async listConversations(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Query('take') take?: string,
    @Query('cursor') cursor?: string,
  ) {
    return successResponse(
      await this.assistant.listConversations(
        { userId, role, organizationId: orgId },
        { take: take ? Number(take) : undefined, cursor },
      ),
    );
  }

  @Get('conversations/:id')
  @Roles(...ALL_INSIDERS)
  async getConversation(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.assistant.getConversation(id, { userId, role, organizationId: orgId }));
  }

  @Post('conversations')
  @Idempotent()
  @Roles(...ALL_INSIDERS)
  async createConversation(
    @Body() dto: CreateConversationDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.assistant.createConversation({ userId, role, organizationId: orgId }, dto.title));
  }

  @Delete('conversations/:id')
  @Roles(...ALL_INSIDERS)
  async archiveConversation(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.assistant.archiveConversation(id, { userId, role, organizationId: orgId }));
  }

  /**
   * Per-user/per-minute cap to avoid runaway LLM cost (10 messages/min/IP +
   * a soft per-user cap via Throttler short window). When LLM_PROVIDER=mock
   * this is purely defensive; under Anthropic it limits real spend.
   */
  @Post('messages')
  @Idempotent()
  @Throttle({ short: { limit: 6, ttl: 60_000 }, medium: { limit: 60, ttl: 60 * 60_000 } })
  @Roles(...ALL_INSIDERS)
  async sendMessage(
    @Body() dto: SendMessageDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(
      await this.assistant.sendMessage(
        dto.conversationId ?? null,
        dto.text,
        { userId, role, organizationId: orgId },
      ),
    );
  }
}

@ApiTags('Anomalies')
@ApiBearerAuth()
@Controller('anomalies')
@UseInterceptors(IdempotencyInterceptor)
export class AnomaliesController {
  constructor(private anomalies: AnomalyService) {}

  @Get()
  @Roles(...ADMIN_BOARD_FINANCE, 'property_manager')
  async list(
    @CurrentUser('organizationId') orgId: string,
    @Query() q: ListAnomaliesQueryDto,
  ) {
    return successResponse(await this.anomalies.list(orgId, q));
  }

  @Post('detect')
  @Idempotent()
  @Roles(...ADMIN_BOARD_FINANCE, 'property_manager')
  async runDetectors(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.anomalies.runDetectors(orgId, { userId, role }));
  }

  @Post(':id/acknowledge')
  @Idempotent()
  @Roles(...ADMIN_BOARD_FINANCE, 'property_manager')
  async acknowledge(
    @Param('id') id: string,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.anomalies.acknowledge(id, orgId, { userId, role }));
  }

  @Post(':id/dismiss')
  @Idempotent()
  @Roles(...ADMIN_BOARD_FINANCE, 'property_manager')
  async dismiss(
    @Param('id') id: string,
    @Body() dto: DismissAnomalyDto,
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return successResponse(await this.anomalies.dismiss(id, orgId, { userId, role }, dto.reason));
  }
}
