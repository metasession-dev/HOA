import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { RecurringInvoicesService } from './recurring.service';
import { LateFeesService } from './late-fees.service';
import { PaymentPlansService } from './payment-plans.service';
import { BillingCatalogService } from './billing-catalog.service';
import { PrismaService } from '../common/prisma.service';
import { FxModule } from '../fx/fx.module';

@Module({
  imports: [FxModule],
  controllers: [BillingController],
  providers: [RecurringInvoicesService, LateFeesService, PaymentPlansService, BillingCatalogService, PrismaService],
  exports: [RecurringInvoicesService, LateFeesService, PaymentPlansService, BillingCatalogService],
})
export class BillingModule {}
