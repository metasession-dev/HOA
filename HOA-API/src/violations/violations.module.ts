import { Module } from '@nestjs/common';
import { ViolationsController } from './violations.controller';
import { ViolationsService } from './violations.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../common/prisma.service';
import { IdempotencyInterceptor } from '../common/idempotency';

@Module({
  imports: [NotificationsModule],
  controllers: [ViolationsController],
  providers: [ViolationsService, PrismaService, IdempotencyInterceptor],
})
export class ViolationsModule {}
