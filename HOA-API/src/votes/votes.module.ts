import { Module } from '@nestjs/common';
import { VotesController, SurveysController } from './votes.controller';
import { VotesService } from './votes.service';
import { SurveysService } from './surveys.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../common/prisma.service';
import { IdempotencyInterceptor } from '../common/idempotency';

@Module({
  imports: [NotificationsModule],
  controllers: [VotesController, SurveysController],
  providers: [VotesService, SurveysService, PrismaService, IdempotencyInterceptor],
  exports: [VotesService],
})
export class VotesModule {}
