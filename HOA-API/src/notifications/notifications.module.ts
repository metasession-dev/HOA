import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [NotificationsController, PushController],
  providers: [NotificationsService, PushService, PrismaService],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
