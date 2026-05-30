import { Module } from '@nestjs/common';
import { TendersController, VendorTendersController } from './tenders.controller';
import { TendersService } from './tenders.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { VotesModule } from '../votes/votes.module';
import { PrismaService } from '../common/prisma.service';

@Module({
  imports: [NotificationsModule, VotesModule],
  controllers: [TendersController, VendorTendersController],
  providers: [TendersService, PrismaService],
})
export class TendersModule {}
