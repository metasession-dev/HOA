import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { RecurringInvoicesService } from './recurring.service';
import { LateFeesService } from './late-fees.service';
import { PaymentPlansService } from './payment-plans.service';
import { PrismaService } from '../common/prisma.service';
import { FxModule } from '../fx/fx.module';

@Module({
  imports: [FxModule],
  controllers: [BillingController],
  providers: [RecurringInvoicesService, LateFeesService, PaymentPlansService, PrismaService],
  exports: [RecurringInvoicesService, LateFeesService, PaymentPlansService],
})
export class BillingModule {}
