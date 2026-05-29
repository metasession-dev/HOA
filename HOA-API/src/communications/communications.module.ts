import { Module } from '@nestjs/common';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { BroadcastsService } from './broadcasts.service';
import { PrismaService } from '../common/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [CommunicationsController],
  providers: [CommunicationsService, BroadcastsService, PrismaService],
  exports: [BroadcastsService],
})
export class CommunicationsModule {}
