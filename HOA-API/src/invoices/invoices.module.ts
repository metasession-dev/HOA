import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../common/prisma.service';
import { FxModule } from '../fx/fx.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [FxModule, NotificationsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, PrismaService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
