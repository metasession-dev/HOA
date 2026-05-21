import { Module } from '@nestjs/common';
import { AssistantController, AnomaliesController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AnomalyService } from './anomaly.service';
import { PrismaService } from '../common/prisma.service';
import { IdempotencyInterceptor } from '../common/idempotency';

@Module({
  controllers: [AssistantController, AnomaliesController],
  providers: [AssistantService, AnomalyService, PrismaService, IdempotencyInterceptor],
})
export class AssistantModule {}
