import { Module } from '@nestjs/common';
import { PassesController, VisitorLogsController } from './passes.controller';
import { PassesService } from './passes.service';
import { PrismaService } from '../common/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PassesController, VisitorLogsController],
  providers: [PassesService, PrismaService],
})
export class PassesModule {}
